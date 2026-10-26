// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusomessages;
import android.app.*;import android.os.*;import android.content.*;import android.net.Uri;import android.provider.Settings;import android.graphics.Color;import android.widget.*;import java.security.SecureRandom;import java.util.Locale;
public final class MainActivity extends Activity {
 private TextView state,pin;private final Handler main=new Handler();
 private android.content.SharedPreferences prefs(){return getSharedPreferences("messages",MODE_PRIVATE);}
 private final Runnable refresh=new Runnable(){public void run(){boolean permission=Settings.canDrawOverlays(MainActivity.this);state.setText((permission?"✓ 疊字權限已允許":"尚未允許疊字權限")+"\n"+prefs().getString("status","請啟動訊息接收器")+"\n"+(prefs().getBoolean("speechReady",false)?"✓ 繁體中文語音已就緒":"繁體中文語音尚未就緒"));long left=(prefs().getLong("pairUntil",0)-System.currentTimeMillis())/1000;String value=prefs().getString("pairPin","");pin.setText(left>0&&!value.isEmpty()?"Mac 配對碼："+value+"（剩餘 "+left+" 秒）":"尚未開啟配對，或配對碼已使用／過期");main.postDelayed(this,1000);}};
 public void onCreate(Bundle saved){super.onCreate(saved);LinearLayout box=new LinearLayout(this);box.setOrientation(1);box.setPadding(60,30,60,30);box.setBackgroundColor(Color.rgb(15,23,20));ScrollView scroll=new ScrollView(this);scroll.addView(box);setContentView(scroll);
  label(box,"Caruso TV Messages",30);label(box,"文字疊加＋語音播報\n設定完成後切回 Apple TV 的 HDMI 畫面。訊息不接管遙控器，也不要求暫停節目或降低音量；實際語音混音仍需依電視輸出測試。",19);
  state=label(box,"",18);pin=label(box,"",28);
  button(box,"1. 允許顯示在其他應用程式上層",()->startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName()))));
  button(box,"2. 開始接收訊息",()->startForegroundService(new Intent(this,MessageService.class)));
  button(box,"3. 顯示新的 Mac 配對碼",()->newPairCode());
  button(box,"語音引擎設定（繁體中文）",()->{try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(ActivityNotFoundException e){Toast.makeText(this,"請由電視系統設定開啟文字轉語音設定",Toast.LENGTH_LONG).show();}});
  button(box,"停止接收並清除字幕／語音",()->stopService(new Intent(this,MessageService.class)));
  label(box,"Copyright (c) 2026 Adms Chung · Apache-2.0\n配對憑證只存於電視與 Mac 本機。接收器使用區域網路連接埠 "+MessageService.PORT+"。",15);
 }
 private void newPairCode(){String code=String.format(Locale.ROOT,"%06d",new SecureRandom().nextInt(1000000));prefs().edit().putString("pairPin",code).putLong("pairUntil",System.currentTimeMillis()+300000).putInt("pairAttempts",0).apply();startForegroundService(new Intent(this,MessageService.class));}
 private TextView label(LinearLayout box,String text,int size){TextView v=new TextView(this);v.setText(text);v.setTextColor(Color.WHITE);v.setTextSize(size);v.setPadding(0,12,0,12);box.addView(v);return v;}
 private void button(LinearLayout box,String text,Runnable r){Button b=new Button(this);b.setText(text);b.setOnClickListener(v->r.run());box.addView(b);}
 public void onResume(){super.onResume();if(prefs().getString("token","").isEmpty() && prefs().getLong("pairUntil",0)<System.currentTimeMillis())newPairCode();main.post(refresh);}public void onPause(){main.removeCallbacks(refresh);super.onPause();}
}
