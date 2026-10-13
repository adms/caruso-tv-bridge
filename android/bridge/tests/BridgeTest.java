// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import tw.local.carusobridge.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
public final class BridgeTest {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format("%02x",x&255));return s.toString();}
 static byte[] unhex(String s){byte[] b=new byte[s.length()/2];for(int i=0;i<b.length;i++)b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);return b;}
 // Correct frames use body = info id followed by information data.
 static byte[] response(int id,byte... info){int n=3+info.length;byte[] b=new byte[5+n];b[0]=(byte)169;b[1]=(byte)238;b[2]=(byte)194;b[3]=(byte)n;b[4]=63;b[5]=(byte)(id>>8);b[6]=(byte)id;System.arraycopy(info,0,b,7,info.length);int c=0;for(int i=0;i<b.length-1;i++)c+=b[i]&255;b[b.length-1]=(byte)c;return b;}
 static void send(Socket s,byte[] b)throws Exception{for(byte v:b)s.getOutputStream().write(v);s.getOutputStream().flush();check(s.getInputStream().read()==0x99,"reply acknowledged");}
 static void scenario(int kind)throws Exception{
  try(ServerSocket server=new ServerSocket(0,1,InetAddress.getByName("127.0.0.1"))){AtomicReference<Throwable> error=new AtomicReference<>();Thread peer=new Thread(()->{try(Socket s=server.accept()){
   s.setSoTimeout(6500);McuProtocol.Packet q=McuProtocol.read(s.getInputStream());check(q.command==63&&q.to==0&&q.data.length==0,"read-only discovery first");
   send(s,response(0xc20c,(byte)1,(byte)0x5e,(byte)'O',(byte)'P',(byte)'T',(byte)'I',(byte)'C',(byte)'A',(byte)'L'));
   send(s,response(0xc200,(byte)2,(byte)(kind==2?3:131),(byte)129,(byte)(kind==7?0:2)));
   send(s,response(0xc200,(byte)5,(byte)33,(byte)0,(byte)63));
   send(s,response(kind==3?0xc20d:0xc20c,(byte)8));
   if(kind>=2&&kind!=3&&kind!=5){
    McuProtocol.Packet refresh=McuProtocol.read(s.getInputStream());check(refresh.command==63&&refresh.to==0,"fresh discovery before power decision");
    send(s,response(0xc20c,(byte)1,(byte)0x5e,(byte)'O',(byte)'P',(byte)'T',(byte)'I',(byte)'C',(byte)'A',(byte)'L'));
    // Reproduce the device's cached ON reply, followed by current standby state.
    send(s,response(0xc200,(byte)2,(byte)131,(byte)129,(byte)(kind==7?0:2)));
    send(s,response(0xc200,(byte)5,(byte)33,(byte)0,(byte)63));send(s,response(0xc20c,(byte)8));
    if(kind==2||kind==8){Thread.sleep(500);send(s,response(0xc200,(byte)2,(byte)64,(byte)129,(byte)2));}
   }
   if(kind==4||kind==5||kind==7||kind==8){check(s.getInputStream().read()==-1,"no command on no-op");return;}
   McuProtocol.Packet p=McuProtocol.read(s.getInputStream());check(p.to==194&&p.from==238&&p.data.length==0,"limited target frame");
   if(kind==0||kind==1){check(p.command==(kind==0?128:160),"volume native step direction");send(s,response(0xc200,(byte)5,(byte)(kind==0?34:32),(byte)0,(byte)63));}
   if(kind==2){check(p.command==215,"explicit power on, never toggle");send(s,response(0xc200,(byte)2,(byte)131,(byte)129,(byte)2));}
   if(kind==6){check(p.command==129,"state-guarded app power button, never unverified F7 or eco off");send(s,response(0xc200,(byte)2,(byte)3,(byte)129,(byte)2));}
   if(kind==3){check(p.command==222,"device reported optical selection");send(s,response(0xc20c,(byte)8));}
   check(s.getInputStream().read()==-1,"one mutation then close");
  }catch(Throwable t){error.set(t);}});peer.start();
  try(McuSession client=new McuSession("127.0.0.1",server.getLocalPort(),true)){McuProtocol.State st=client.observe();check(st.volume==33&&st.maxVolume==63,"native 0..63 volume");if(kind==7){try{client.ensureComfortStandby();throw new AssertionError("comfort disabled but sent standby");}catch(IOException good){}check(!client.attempted(),"no shutdown when network wake unavailable");}else if(kind==5){client.setWriteGuard(()->false);try{client.volumeStep(1);throw new AssertionError("expired trigger accepted");}catch(IOException good){}check(!client.attempted(),"expired guard sends no mutation");}else{String result=kind<2?client.volumeStep(kind==0?1:-1):kind==2?client.ensurePowerOn():kind==3?client.ensureOptical():(kind==6||kind==8)?client.ensureComfortStandby():client.ensurePowerOn();check(!result.isEmpty(),"outcome");if(kind==4||kind==8)check(!client.attempted(),"idempotent power-on");}}
  peer.join(5000);check(!peer.isAlive(),"mock completed");if(error.get()!=null)throw new AssertionError(error.get());
  }
 }
 static void persistentVolumeCycle()throws Exception{
  try(ServerSocket server=new ServerSocket(0,1,InetAddress.getByName("127.0.0.1"))){AtomicReference<Throwable> error=new AtomicReference<>();Thread peer=new Thread(()->{try(Socket s=server.accept()){
   s.setSoTimeout(4000);check(McuProtocol.read(s.getInputStream()).command==63,"initial discovery");
   send(s,response(0xc20c,(byte)1,(byte)0x5e,(byte)'O',(byte)'P',(byte)'T',(byte)'I',(byte)'C',(byte)'A',(byte)'L'));
   send(s,response(0xc200,(byte)2,(byte)131,(byte)129,(byte)2));send(s,response(0xc200,(byte)5,(byte)33,(byte)0,(byte)63));send(s,response(0xc20c,(byte)8));
   check(McuProtocol.read(s.getInputStream()).command==160,"persistent down");send(s,response(0xc200,(byte)5,(byte)32,(byte)0,(byte)63));
   check(McuProtocol.read(s.getInputStream()).command==128,"persistent up, no full-query lag");send(s,response(0xc200,(byte)5,(byte)33,(byte)0,(byte)63));check(s.getInputStream().read()==-1,"no replay after two physical actions");
  }catch(Throwable t){error.set(t);}});peer.start();
  try(McuSession s=new McuSession("127.0.0.1",server.getLocalPort(),true)){s.observe();check(s.volumeStep(-1).contains("33 -> 32"),"down confirmation");check(s.volumeStep(1).contains("32 -> 33"),"up confirmation");}
  peer.join(5000);check(!peer.isAlive(),"persistent peer closed");if(error.get()!=null)throw new AssertionError(error.get());
  }
 }
 public static void main(String[] a)throws Exception{
  check(hex(McuProtocol.powerButton()).equals("a9c2ee0181db"),"verified app power button checksum");
  check(hex(McuProtocol.displayQuery()).equals("a900ee013fd7"),"app discovery frame");check(hex(McuProtocol.powerOn()).equals("a9c2ee01d731"),"power checksum");check(hex(McuProtocol.optical()).equals("a9c2ee01de38"),"optical checksum");
  byte[] corrupt=response(0xc200,(byte)5,(byte)33,(byte)0,(byte)63);corrupt[corrupt.length-1]^=1;try{McuProtocol.read(new ByteArrayInputStream(corrupt));throw new AssertionError("corrupt accepted");}catch(IOException good){}
  check(RemoteEvent.parse("[ 18432.405134] /dev/input/event1: EV_KEY KEY_VOLUMEDOWN UP").kernelMs==18432405,"captured Sony event format");check(RemoteEvent.parse("[ 1.0] /dev/input/event1: EV_KEY KEY_A DOWN")==null,"unrelated keys discarded");
  String old="[R] time=2000-01-01 01:00:00 message=<Active Source> 4F:82:30:00",fresh="[R] time=2000-01-01 01:01:00 message=<Image View On> 40:04";
  CecEvents c=new CecEvents();check(c.accept(old).isEmpty(),"baseline never triggers");check(c.accept(old+"\n"+fresh).equals(Arrays.asList(fresh)),"new wake only");check(c.accept(fresh).isEmpty(),"duplicate ignored");check(c.wake(fresh),"wake recognized");check(!c.wake("[R] time=2000-01-01 01:01:00 message=<Active Source> 4F:82:20:00"),"other HDMI not wake");
  for(int i=0;i<9;i++)scenario(i);persistentVolumeCycle();
  check(CecEvents.tvPower("  mPowerStatus: 1\n")==1&&CecEvents.tvPower("Report Power Status 40:90:01")==-1,"TV power state, not peer report");
  VolumeGestures g=new VolumeGestures();RemoteEvent down=RemoteEvent.parse("[ 1.000000] /dev/input/event1: EV_KEY KEY_VOLUMEDOWN DOWN");VolumeGestures.Step first=g.accept(down,1000);check(first.delta==-1&&g.valid(first,1100),"initial native decrement");check(g.repeat(1599)==null,"repeat delay");VolumeGestures.Step repeat=g.repeat(1600);check(repeat!=null&&g.valid(repeat,1601),"held repeat");g.accept(RemoteEvent.parse("[ 1.700000] /dev/input/event1: EV_KEY KEY_VOLUMEDOWN UP"),1700);check(!g.valid(repeat,1701)&&g.repeat(1900)==null,"release cancels queued repeat");
  g=new VolumeGestures();g.accept(down,1000);check(g.repeat(3501)==null,"lost release has bounded hold duration");check(g.accept(down,4000)==null,"stale physical event excluded");
  System.out.println("PASS: cached power correction; already-off toggle suppressed; native volume +/-; idempotent power-on; identified optical; fragmented TCP; checksums; no additional mutations; limited key capture; no stale CEC replay");
 }
}
