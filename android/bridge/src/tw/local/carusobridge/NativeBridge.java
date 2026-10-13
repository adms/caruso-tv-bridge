// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusobridge;
import android.os.Process;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
/** TV-local bridge. Runtime survives ADB disconnect; boot persistence is a separate launcher concern. */
public final class NativeBridge {
 private static volatile boolean running=true;private static BufferedWriter log;private static File directory,logFile;private static int mutations;private static boolean playVerified;
 private static synchronized void emit(String type,String detail)throws Exception{
  if(logFile.length()>2097152){log.close();File prev=new File(directory,"events.previous.jsonl");if(prev.exists()&&!prev.delete())throw new IOException("Log rotation failed");if(!logFile.renameTo(prev))throw new IOException("Log rotation failed");log=new BufferedWriter(new OutputStreamWriter(new FileOutputStream(logFile),StandardCharsets.UTF_8));}
  JSONObject j=new JSONObject();j.put("type",type);j.put("detail",detail);j.put("wallTimeMs",System.currentTimeMillis());j.put("uptimeMs",SystemClock.uptimeMillis());j.put("elapsedRealtimeMs",SystemClock.elapsedRealtime());j.put("pid",Process.myPid());j.put("uid",Process.myUid());j.put("controlWriteAttempts",mutations);j.put("audioSettingWrites",0);log.write(j.toString());log.newLine();log.flush();
 }
 private static void safeEmit(String t,String d){try{emit(t,d);}catch(Exception e){running=false;}}
 private static final class Action {
  final String kind;final VolumeGestures.Step step;final long created;
  Action(String k,VolumeGestures.Step s){kind=k;step=s;created=SystemClock.uptimeMillis();}
 }
 private static boolean freshCec(String line){
  try{int start=line.indexOf("time=")+5;String stamp=line.substring(start,start+19);SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd HH:mm:ss",Locale.ROOT);f.setLenient(false);long age=System.currentTimeMillis()-f.parse(stamp).getTime();return age>=-2000&&age<10000;}catch(Exception e){return false;}
 }
 public static void main(String[] a)throws Exception{
  if(a.length!=7||!a[0].matches("/data/local/tmp/caruso-native-bridge-[A-Za-z0-9-]+"))throw new IllegalArgumentException("Required: own directory, duration, Caruso IP, IR device, IR name, HDMI port, CEC logical address");
  final BridgeConfig config=new BridgeConfig(a[2],a[3],a[4],Integer.parseInt(a[5]),Integer.parseInt(a[6]));
  boolean wakeOptical=true;int seconds=Integer.parseInt(a[1]);if(seconds<0||seconds>86400)throw new IllegalArgumentException("Duration 0 (until stopped) or 1..86400 seconds");playVerified=false;
  directory=new File(a[0]);if(!directory.isDirectory())throw new IllegalArgumentException("Directory missing");
  try(RandomAccessFile lockFile=new RandomAccessFile("/data/local/tmp/caruso-native-bridge.lock","rw");FileChannel channel=lockFile.getChannel();FileLock lock=channel.tryLock()){
   if(lock==null)throw new IOException("Another bridge is running");
   logFile=new File(directory,"events.jsonl");if(!logFile.createNewFile())throw new IOException("Do not overwrite run evidence");log=new BufferedWriter(new OutputStreamWriter(new FileOutputStream(logFile),StandardCharsets.UTF_8));
   VolumeGestures gestures=new VolumeGestures(config.inputDevice);BlockingQueue<Action> queue=new ArrayBlockingQueue<>(16);AtomicBoolean inputEnded=new AtomicBoolean();AtomicBoolean tvSleeping=new AtomicBoolean();java.lang.Process input=null;Thread reader=null,cecThread=null;String reason="stopped";McuSession live=null;
   long deadline=seconds==0?Long.MAX_VALUE:SystemClock.elapsedRealtime()+seconds*1000L;
   try{
    try{live=new McuSession(config.host,50001,true);emit("baseline",live.observe().description());}catch(IOException e){if(live!=null){live.close();live=null;}emit("baseline_unavailable","Will wait for a fresh physical trigger; "+e.getMessage());}
    CecEvents cec=new CecEvents(config.cecLogical,config.hdmiPort);String baselineDump=TvDiagnostics.hdmi(directory);cec.accept(baselineDump);final int initialPower=CecEvents.tvPower(baselineDump);tvSleeping.set(initialPower==1||initialPower==3);
    cecThread=new Thread(()->{int fails=0,lastPower=initialPower;long lastWake=0;while(running){try{String dump=TvDiagnostics.hdmi(directory);int power=CecEvents.tvPower(dump);if(power>=0){boolean asleep=power==1||power==3;tvSleeping.set(asleep);if(lastPower>=0&&(lastPower==0||lastPower==2)&&asleep){gestures.clear();queue.clear();safeEmit("tv_standby","Sony power status "+lastPower+" -> "+power);queue.offer(new Action("comfort-standby",null));}lastPower=power;}for(String event:cec.accept(dump)){safeEmit("cec_received",event);if(cec.wake(event)&&freshCec(event)&&SystemClock.uptimeMillis()-lastWake>3000){lastWake=SystemClock.uptimeMillis();if(!queue.offer(new Action("power-on",null)))safeEmit("dropped","CEC queue full");}}fails=0;Thread.sleep(2000);}catch(Exception e){if(!running)break;safeEmit("cec_error",e.getClass().getSimpleName());if(++fails>=5){safeEmit("suspended","CEC unavailable; stopping bridge");running=false;}}}},"cec-observer");cecThread.setDaemon(true);cecThread.start();
    input=new ProcessBuilder("/system/bin/getevent","-lt").redirectError(new File(directory,"getevent-error.txt")).start();final java.lang.Process child=input;
    reader=new Thread(()->{try(BufferedReader r=new BufferedReader(new InputStreamReader(child.getInputStream(),StandardCharsets.UTF_8))){String line;while(running&&(line=r.readLine())!=null){RemoteEvent e=RemoteEvent.parse(line);if(e==null)continue;safeEmit("remote_key",e.description());VolumeGestures.Step step=gestures.accept(e,SystemClock.uptimeMillis());if(step!=null&&!queue.offer(new Action("volume",step))){gestures.clear();safeEmit("dropped","Input queue full; hold cancelled");}if(playVerified&&e.device.equals(config.inputDevice)&&e.action.equals("down")&&e.key.matches("KEY_PLAYPAUSE|KEY_PLAY|KEY_PAUSE")&&Math.abs(SystemClock.uptimeMillis()-e.kernelMs)<1000){if(!queue.offer(new Action("optical",null)))safeEmit("dropped","Play queue full");}}}catch(Exception e){if(running)safeEmit("input_error",e.getClass().getSimpleName());}finally{inputEnded.set(true);}},"remote-reader");reader.setDaemon(true);reader.start();
    emit("ready","Native volume +/-; hold limited to 2.5 seconds per press; Configured Apple TV HDMI wake -> explicit power on; TV off -> Comfort Standby; playKeysVerified="+playVerified+"; wakeSelectsOptical="+wakeOptical+"; no audio setting writes");long heartbeat=0;
    while(running&&SystemClock.elapsedRealtime()<deadline&&!new File(directory,"stop").exists()){
     if(inputEnded.get()){reason="input_ended";break;}long now=SystemClock.uptimeMillis();Action action=queue.poll(50,TimeUnit.MILLISECONDS);
     if(action==null){VolumeGestures.Step step=gestures.repeat(now);if(step!=null)action=new Action("volume",step);}
     if(now>heartbeat){emit("heartbeat","TV-local bridge running");heartbeat=now+30000;}
     if(action==null)continue;final Action selected=action;
     java.util.function.BooleanSupplier valid=()->running&&!new File(directory,"stop").exists()&&SystemClock.elapsedRealtime()<deadline&&SystemClock.uptimeMillis()-selected.created<10000&&(selected.kind.equals("comfort-standby")?tvSleeping.get():!tvSleeping.get())&&(selected.step==null||gestures.valid(selected.step,SystemClock.uptimeMillis()));
     if(!valid.getAsBoolean()){emit("dropped","Expired "+action.kind);continue;}
     try{
      if(live!=null){try{live.current();}catch(IOException stale){live.close();live=null;}}
      if(live==null){live=new McuSession(config.host,50001,true);live.observe();}
      McuSession s=live;s.setWriteGuard(valid);McuProtocol.State observed=s.current();emit("before_action",action.kind+"; "+observed.description());
      try{String outcome=action.kind.equals("volume")?s.volumeStep(action.step.delta):action.kind.equals("power-on")?s.ensurePowerOn():action.kind.equals("comfort-standby")?s.ensureComfortStandby():s.ensureOptical();if(s.attempted())mutations++;emit("action_result",action.kind+"; "+outcome);if(wakeOptical&&action.kind.equals("power-on")&&!queue.offer(new Action("optical",null)))emit("dropped","Optical queue full");}
      catch(Exception e){if(s.attempted())mutations++;throw e;}
     }catch(Exception e){if(live!=null){live.close();live=null;}gestures.clear();queue.clear();emit("action_error","No mutation retry; pending gestures cancelled; "+e.getClass().getSimpleName()+": "+e.getMessage());}
    }
    if(SystemClock.elapsedRealtime()>=deadline)reason="deadline";if(new File(directory,"stop").exists())reason="requested_stop";
   }catch(Exception e){reason="error";emit("error",e.getClass().getSimpleName()+": "+e.getMessage());}
   finally{running=false;if(live!=null)live.close();gestures.clear();if(input!=null){input.destroy();if(!input.waitFor(2,TimeUnit.SECONDS)){input.destroyForcibly();input.waitFor(2,TimeUnit.SECONDS);}}if(reader!=null)reader.join(1000);if(cecThread!=null){cecThread.interrupt();cecThread.join(5000);}emit("finished",reason+"; childAlive="+(input!=null&&input.isAlive()));log.close();}
  }
 }
}
