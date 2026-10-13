// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusobridge;
import java.io.*;
import java.net.*;
import java.util.*;
/** Continuously drains/acknowledges state updates; one outstanding mutation, no mutation retry. */
public final class McuSession implements AutoCloseable {
 private final Socket socket=new Socket();private final Timer watchdog=new Timer(true);private final Object lock=new Object(),writeLock=new Object();private final McuProtocol.State state=new McuProtocol.State();
 private final boolean persistent;private boolean attempted,everAttempted,observed;private volatile boolean closed;private volatile IOException failure;private Thread reader;private volatile long lastReceived=now();private long volumeVersion,powerVersion,sourceVersion;private java.util.function.BooleanSupplier allowed=()->true;
 public McuSession(String host,int port)throws IOException{this(host,port,false);}
 public McuSession(String host,int port,boolean persistent)throws IOException{
  this.persistent=persistent;
  if(!persistent)watchdog.schedule(new TimerTask(){public void run(){close();}},12000);
  try{socket.connect(new InetSocketAddress(host,port),2000);socket.setTcpNoDelay(true);reader=new Thread(()->{
   try{while(!closed){McuProtocol.Packet p=McuProtocol.read(socket.getInputStream());lastReceived=now();if(p.type==0x95||p.type==0x69||p.type==0x96)throw new IOException("MCU rejected or busy: "+p.type);if(p.type==0xa9||p.type==0xa8)send(new byte[]{(byte)0x99});
    synchronized(lock){state.accept(p,now());if(p.to==0xee&&p.from==McuProtocol.MASTER&&p.command==63){if(p.info()==5&&p.sourceId()==0xc200)volumeVersion++;if(p.info()==2&&p.sourceId()==0xc200)powerVersion++;if(p.info()==8)sourceVersion++;}lock.notifyAll();}
   }}catch(IOException e){if(!closed)failure=e;}finally{synchronized(lock){if(!closed&&failure==null)failure=new IOException("MCU reader ended");lock.notifyAll();}}},"caruso-state-reader");reader.setDaemon(true);reader.start();
   if(persistent)watchdog.schedule(new TimerTask(){public void run(){if(closed)return;try{if(now()-lastReceived>16000)throw new SocketTimeoutException("MCU keep-alive expired");send(McuProtocol.keepAlive());}catch(IOException e){failure=e;close();}}},7500,7500);
  }catch(IOException e){close();throw e;}
 }
 private static long now(){return System.nanoTime()/1000000;}
 private void send(byte[] b)throws IOException{synchronized(writeLock){socket.getOutputStream().write(b);socket.getOutputStream().flush();}}
 private void healthy()throws IOException{if(failure!=null)throw failure;if(closed)throw new IOException("MCU session closed");}
 private McuProtocol.State snapshot(){McuProtocol.State copy=new McuProtocol.State();copy.volume=state.volume;copy.maxVolume=state.maxVolume;copy.source=state.source;copy.on=state.on;copy.comfortStandby=state.comfortStandby;copy.masterVerified=state.masterVerified;copy.opticalVerified=state.opticalVerified;copy.volumeAt=state.volumeAt;copy.powerAt=state.powerAt;copy.sourceAt=state.sourceAt;return copy;}
 private interface Ready{boolean done();}
 private void await(Ready condition,long deadline)throws IOException{
  synchronized(lock){while(!condition.done()){healthy();long left=deadline-now();if(left<=0)throw new SocketTimeoutException("MCU confirmation timed out");try{lock.wait(Math.min(left,500));}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException("Interrupted",e);}}healthy();}
 }
 public McuProtocol.State observe()throws IOException{
  long v,p,s;synchronized(lock){healthy();v=volumeVersion;p=powerVersion;s=sourceVersion;}
  send(McuProtocol.displayQuery());await(()->state.masterVerified&&state.opticalVerified&&volumeVersion>v&&powerVersion>p&&sourceVersion>s,now()+6000);
  synchronized(lock){observed=true;return snapshot();}
 }
 public McuProtocol.State current()throws IOException{synchronized(lock){healthy();if(!observed)throw new IOException("Observe first");return snapshot();}}
 public void setWriteGuard(java.util.function.BooleanSupplier guard){allowed=guard;}
 private void mutate(byte[] command)throws IOException{
  healthy();if(!allowed.getAsBoolean())throw new IOException("Trigger expired or stopped; no write");
  synchronized(lock){if(everAttempted&&!persistent)throw new IOException("One control write per short session");if(!observed||!state.masterVerified||!state.opticalVerified||state.on==null||(!persistent&&(now()-state.powerAt>1500||now()-state.volumeAt>1500)))throw new IOException("Identified live state required");}
  attempted=true;everAttempted=true;send(command);
 }
 private TimerTask actionTimeout(){TimerTask t=new TimerTask(){public void run(){failure=new SocketTimeoutException("MCU action watchdog");close();}};watchdog.schedule(t,8500);return t;}
 public String volumeStep(int delta)throws IOException{
  attempted=false;if(delta!=1&&delta!=-1)throw new IllegalArgumentException("Unit step required");TimerTask guard=actionTimeout();
  try{McuProtocol.State before=current();if(!Boolean.TRUE.equals(before.on))return "ignored: Caruso is in standby";int target=before.volume+delta;if(target<0||target>before.maxVolume)return "at volume boundary: "+before.volume;
   long version;synchronized(lock){version=volumeVersion;}mutate(McuProtocol.volumeStep(delta));await(()->volumeVersion>version&&state.volume!=before.volume,now()+6000);McuProtocol.State after=current();if(after.volume!=target)throw new IOException("Volume outcome differs; actual="+after.volume+", expected="+target);return "volume confirmed "+before.volume+" -> "+after.volume;
  }finally{guard.cancel();}
 }
 public String ensurePowerOn()throws IOException{
  attempted=false;refreshPower();TimerTask guard=actionTimeout();try{if(Boolean.TRUE.equals(current().on))return "already on; no command";long version;synchronized(lock){version=powerVersion;}mutate(McuProtocol.powerOn());await(()->powerVersion>version&&Boolean.TRUE.equals(state.on),now()+8000);return "power on confirmed";}finally{guard.cancel();}
 }
 /** The device emits cached display power followed by authoritative current power (~0.5 s later).
  * Drain both before deciding whether the non-idempotent app power button is needed. */
 private void refreshPower()throws IOException{
  long start=now();observe();
  await(()->now()-start>=1800&&now()-state.powerAt>=750,start+6000);
 }
 public String ensureComfortStandby()throws IOException{
  attempted=false;refreshPower();TimerTask guard=actionTimeout();try{McuProtocol.State before=current();if(!before.comfortStandby)throw new IOException("Comfort Standby unavailable; no power or setting write");if(Boolean.FALSE.equals(before.on))return "already in Comfort Standby; no command";long version;synchronized(lock){version=powerVersion;}mutate(McuProtocol.powerButton());await(()->powerVersion>version&&Boolean.FALSE.equals(state.on)&&state.comfortStandby,now()+8000);return "Comfort Standby confirmed; guarded app power button; network session retained";}finally{guard.cancel();}
 }
 public String ensureOptical()throws IOException{
  attempted=false;TimerTask guard=actionTimeout();try{McuProtocol.State before=current();if(before.source==McuProtocol.OPTICAL)return "already OPTICAL; no command";if(!Boolean.TRUE.equals(before.on))return "ignored: Caruso is in standby";long version;synchronized(lock){version=sourceVersion;}mutate(McuProtocol.optical());await(()->sourceVersion>version&&state.source==McuProtocol.OPTICAL,now()+6000);return "OPTICAL confirmed";}finally{guard.cancel();}
 }
 public boolean attempted(){return attempted;}
 public void close(){closed=true;watchdog.cancel();try{socket.close();}catch(IOException ignored){}synchronized(lock){lock.notifyAll();}}
}
