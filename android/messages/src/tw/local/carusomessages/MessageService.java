// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusomessages;
import android.app.*;import android.content.*;import android.os.*;import android.provider.Settings;
import android.graphics.*;import android.view.*;import android.widget.*;import android.media.AudioAttributes;
import android.speech.tts.*;import org.json.*;
import java.util.*;import java.util.concurrent.*;import java.security.*;import java.nio.charset.StandardCharsets;
public final class MessageService extends Service {
 static final int PORT=43719;
 private final Handler main=new Handler(Looper.getMainLooper());private WindowManager windows;private volatile TextView overlay;private TextToSpeech tts;private volatile boolean speechReady,languageReady;private volatile String speechState="initializing",lastError="";private LocalHttp http;private long lastSend;private volatile boolean active;
 private final Runnable clearText=()->removeText();
 private SharedPreferences prefs(){return getSharedPreferences("messages",MODE_PRIVATE);}
 public IBinder onBind(Intent i){return null;}
 public void onCreate(){super.onCreate();NotificationManager n=getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel("messages","電視文字與語音",NotificationManager.IMPORTANCE_LOW));PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);startForeground(71,new Notification.Builder(this,"messages").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Caruso TV Messages").setContentText("接收區域網路文字與語音訊息").setContentIntent(open).build());
  windows=getSystemService(WindowManager.class);
  tts=new TextToSpeech(this,result->{main.post(()->{speechReady=result==TextToSpeech.SUCCESS;if(speechReady){int l=tts.setLanguage(Locale.TAIWAN);languageReady=l>=TextToSpeech.LANG_AVAILABLE;tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){speechState="speaking";}public void onDone(String id){speechState="done";}public void onError(String id){speechState="error";lastError="語音引擎播放失敗";}});}speechState=speechReady&&languageReady?"ready":"unavailable";prefs().edit().putBoolean("speechReady",speechReady&&languageReady).apply();});});
  try{http=new LocalHttp(PORT,(path,h,body)->handle(path,h,body));active=true;prefs().edit().putString("status","已開始接收，連接埠 "+PORT).apply();}catch(Exception e){prefs().edit().putString("status","接收器無法啟動").apply();stopSelf();}
 }
 public int onStartCommand(Intent intent,int flags,int id){if(intent!=null&&"stop".equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}return START_STICKY;}
 private LocalHttp.Reply json(int code,JSONObject value){return new LocalHttp.Reply(code,value.toString());}
 private JSONObject error(String text)throws JSONException{return new JSONObject().put("error",text);}
 private synchronized LocalHttp.Reply handle(String path,Map<String,String> headers,byte[] body)throws Exception{
  JSONObject data=new JSONObject(new String(body,StandardCharsets.UTF_8));
  if(path.equals("/pair")){
   long expiry=prefs().getLong("pairUntil",0);int attempts=prefs().getInt("pairAttempts",0);String pin=prefs().getString("pairPin","");
   if(System.currentTimeMillis()>expiry||pin.isEmpty()||attempts>=8)return json(403,error("請在電視開啟新的配對碼"));
   prefs().edit().putInt("pairAttempts",attempts+1).apply();
   if(!equal(pin,data.optString("pin")))return json(403,error("配對碼不正確"));
   byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);String token=android.util.Base64.encodeToString(bytes,android.util.Base64.NO_WRAP|android.util.Base64.URL_SAFE);prefs().edit().putString("token",token).remove("pairPin").remove("pairUntil").apply();
   return json(200,new JSONObject().put("token",token));
  }
  String token=prefs().getString("token","");if(token.isEmpty()||!equal("Bearer "+token,headers.getOrDefault("authorization","")))return json(403,error("尚未配對或授權已失效"));
  if(path.equals("/status"))return json(200,new JSONObject().put("ready",active).put("overlayPermission",Settings.canDrawOverlays(this)).put("speechReady",speechReady&&languageReady).put("speechState",speechState).put("lastError",lastError).put("displaying",overlay!=null));
  if(path.equals("/clear")){runMain(()->{removeText();if(tts!=null)tts.stop();speechState=speechReady&&languageReady?"ready":"unavailable";});return json(200,new JSONObject().put("cleared",true));}
  if(!path.equals("/message"))return json(404,error("Unknown endpoint"));
  if(System.currentTimeMillis()-lastSend<800)return json(429,error("請稍候再傳送"));
  String text=data.optString("text","").trim();boolean display=data.optBoolean("display",true),speak=data.optBoolean("speak",true);int seconds=data.optInt("seconds",10);double volume=data.optDouble("speechVolume",0.6);
  if(text.isEmpty()||text.codePointCount(0,text.length())>280||text.matches("(?s).*[\\p{Cntrl}&&[^\\n\\t]].*"))return json(400,error("文字需為 1–280 字"));
  if((!display&&!speak)||seconds<3||seconds>60||Double.isNaN(volume)||volume<0||volume>1)return json(400,error("顯示與語音參數不正確"));
  if(display&&!Settings.canDrawOverlays(this))return json(409,error("請先在電視允許顯示在其他應用程式上層"));
  if(speak&&(!speechReady||!languageReady))return json(409,error("電視繁體中文語音引擎尚未就緒，可先使用純文字"));
  String requestId=data.optString("requestId","");if(!requestId.matches("[a-zA-Z0-9-]{8,80}"))return json(400,error("Invalid request id"));
  if(requestId.equals(prefs().getString("lastRequest","")))return json(200,new JSONObject().put("accepted",true).put("duplicate",true));
  runMain(()->{if(display)show(text,seconds);else removeText();if(tts!=null)tts.stop();if(speak){Bundle options=new Bundle();options.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,(float)volume);speechState="queued";if(tts.speak(text,TextToSpeech.QUEUE_FLUSH,options,requestId)==TextToSpeech.ERROR)throw new IllegalStateException("電視語音引擎拒絕播放");}});
  lastSend=System.currentTimeMillis();prefs().edit().putString("lastRequest",requestId).apply();return json(200,new JSONObject().put("accepted",true).put("display",display).put("speechQueued",speak));
 }
 private static boolean equal(String a,String b){return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));}
 private void runMain(Runnable action)throws Exception{FutureTask<Void> task=new FutureTask<>(()->{if(!active)throw new IllegalStateException("接收器已停止");action.run();return null;});main.post(task);task.get(2,TimeUnit.SECONDS);}
 private void show(String text,int seconds){removeText();TextView view=new TextView(this);view.setText(text);view.setTextColor(Color.WHITE);view.setTextSize(26);view.setGravity(Gravity.CENTER);view.setPadding(32,20,32,20);view.setBackgroundColor(Color.argb(205,15,20,16));view.setMaxLines(8);view.setMaxHeight((int)(getResources().getDisplayMetrics().heightPixels*.6));view.setAutoSizeTextTypeUniformWithConfiguration(16,26,2,android.util.TypedValue.COMPLEX_UNIT_SP);
  android.util.DisplayMetrics metrics=getResources().getDisplayMetrics();WindowManager.LayoutParams p=new WindowManager.LayoutParams((int)(metrics.widthPixels*.85),WindowManager.LayoutParams.WRAP_CONTENT,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);p.gravity=Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL;p.y=(int)(metrics.heightPixels*.07);windows.addView(view,p);overlay=view;main.postDelayed(clearText,seconds*1000L);
 }
 private void removeText(){main.removeCallbacks(clearText);if(overlay!=null){try{windows.removeView(overlay);}catch(IllegalArgumentException ignored){}overlay=null;}}
 public void onDestroy(){active=false;prefs().edit().putString("status","訊息接收器已停止").putBoolean("speechReady",false).apply();main.removeCallbacksAndMessages(null);if(http!=null)http.close();removeText();if(tts!=null){tts.stop();tts.shutdown();}super.onDestroy();}
}
