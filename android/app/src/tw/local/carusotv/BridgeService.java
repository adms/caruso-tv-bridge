// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusotv;
import android.app.*;
import android.content.*;
import android.os.*;
import org.json.JSONObject;
import tw.local.carusobridge.BridgeConfig;
import java.util.concurrent.*;
/** Foreground supervisor for its own TV-local bridge only. */
public final class BridgeService extends Service {
 private final ExecutorService executor=Executors.newSingleThreadExecutor();private final Handler handler=new Handler();private volatile boolean stopping;private boolean busy;private int failures;
 private final Runnable tick=()->{if(!stopping)check(false);};
 private android.content.SharedPreferences prefs(){return getSharedPreferences("bridge",MODE_PRIVATE);}
 public IBinder onBind(Intent i){return null;}
 public void onCreate(){super.onCreate();NotificationManager n=getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel("bridge","Caruso 電視橋接",NotificationManager.IMPORTANCE_LOW));startForeground(42,notification("準備電視本機連線"));}
 private Notification notification(String text){Intent open=new Intent(this,MainActivity.class);PendingIntent p=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);return new Notification.Builder(this,"bridge").setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Caruso TV Bridge").setContentText(text).setContentIntent(p).setOngoing(true).build();}
 private void status(String text){android.util.Log.i("CarusoBridge",text);prefs().edit().putString("status",text).putLong("statusAt",System.currentTimeMillis()).apply();getSystemService(NotificationManager.class).notify(42,notification(text));}
 public int onStartCommand(Intent i,int flags,int id){
  if(i!=null&&"stop".equals(i.getAction())){stopping=true;prefs().edit().putBoolean("enabled",false).putBoolean("boot",false).apply();handler.removeCallbacks(tick);executor.execute(()->{try(LocalAdb adb=new LocalAdb(this,20)){String dir=prefs().getString("runDir","");if(validDir(dir)){adb.shell("touch "+LocalAdb.quote(dir+"/stop"));status("已要求停止橋接");}else status("沒有執行中的橋接");}catch(Exception e){status("停止未確認，請重新開啟 App："+e.getClass().getSimpleName());}finally{stopForeground(true);stopSelf();}});return START_NOT_STICKY;}
  try{BridgeSettings.read(prefs());}catch(IllegalArgumentException e){status("請先填寫有效的 Caruso 與電視設定");stopForeground(true);stopSelf();return START_NOT_STICKY;}
  prefs().edit().putBoolean("enabled",true).apply();check(i!=null&&"start".equals(i.getAction()));return START_STICKY;
 }
 private static boolean validDir(String s){return s.matches("/data/local/tmp/caruso-native-bridge-app-[0-9]+");}
 private void check(boolean userStarted){
  if(busy||stopping)return;busy=true;status(userStarted?"首次連線請在電視允許本機偵錯授權":"檢查橋接狀態");
  executor.execute(()->{try(LocalAdb adb=new LocalAdb(this,userStarted?180:20)){
   BridgeConfig config=BridgeSettings.read(prefs());
   if(!adb.shell("id -u").trim().equals("2000"))throw new IllegalStateException("Unexpected shell identity");
   String dir=prefs().getString("runDir","");String last=validDir(dir)?adb.shell("tail -n 1 "+LocalAdb.quote(dir+"/events.jsonl")+" 2>/dev/null").trim():"";boolean alive=false;
   if(last.startsWith("{")){try{JSONObject j=new JSONObject(last);int pid=j.getInt("pid");String type=j.optString("type");if(!type.equals("finished")){String cmd=adb.shell("cat /proc/"+pid+"/cmdline 2>/dev/null");alive=cmd.contains("tw.local.carusobridge.NativeBridge");}}catch(Exception ignored){}}
   if(!alive&&!stopping){
    String input=adb.shell("getevent -lp "+LocalAdb.quote(config.inputDevice));if(!input.contains("\""+config.inputName+"\""))throw new IllegalStateException("Sony IR input changed");
    dir="/data/local/tmp/caruso-native-bridge-app-"+System.currentTimeMillis();prefs().edit().putString("runDir",dir).apply();
    String made=adb.shell("mkdir -m 700 "+LocalAdb.quote(dir)+" && echo directory-ready").trim();if(!made.equals("directory-ready"))throw new IllegalStateException("Could not create bridge directory");
    String command="CLASSPATH="+LocalAdb.quote(getApplicationInfo().sourceDir)+" /system/bin/nohup /system/bin/app_process /system/bin tw.local.carusobridge.NativeBridge "+LocalAdb.quote(dir)+" 0 "+LocalAdb.quote(config.host)+" "+LocalAdb.quote(config.inputDevice)+" "+LocalAdb.quote(config.inputName)+" "+config.hdmiPort+" "+config.cecLogical+" </dev/null >"+LocalAdb.quote(dir+"/launcher.log")+" 2>&1 & bridge_pid=$!; sleep 1; echo $bridge_pid";
    String pid=adb.shell(command).trim();if(!pid.matches("[0-9]+"))throw new IllegalStateException("Bridge launch did not return a PID");
    boolean ready=false;for(int attempt=0;attempt<20&&!stopping;attempt++){Thread.sleep(400);String lines=adb.shell("tail -n 40 "+LocalAdb.quote(dir+"/events.jsonl")+" 2>/dev/null");for(String line:lines.split("\n")){if(!line.startsWith("{"))continue;JSONObject j=new JSONObject(line);if(j.optString("type").equals("finished"))throw new IllegalStateException(j.optString("detail"));if(j.optString("type").equals("ready"))ready=true;}if(ready)break;}
    if(!ready)throw new IllegalStateException("Bridge did not become ready");

   }
   failures=0;status(stopping?"正在停止":"橋接執行中：音量 ±、開機／光纖、關電視待機");
  }catch(Exception e){failures++;android.util.Log.w("CarusoBridge","Startup/check failed",e);status("橋接尚未就緒："+e.getClass().getSimpleName()+": "+e.getMessage());}
  finally{handler.post(()->{busy=false;if(!stopping){if(failures>=3){status("連線連續失敗；請開啟 App 重新啟動");stopForeground(true);stopSelf();}else handler.postDelayed(tick,30000);}});}});
 }
 public void onDestroy(){stopping=true;handler.removeCallbacks(tick);executor.shutdown();super.onDestroy();}
}
