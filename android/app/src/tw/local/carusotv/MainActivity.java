// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusotv;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.text.InputType;
import android.widget.*;
import java.io.*;
import tw.local.carusobridge.BridgeConfig;

public final class MainActivity extends Activity {
    private TextView status;
    private EditText host, hdmi, device, deviceName, logical;
    private Switch boot;
    private final Handler handler = new Handler();
    private SharedPreferences prefs() { return getSharedPreferences("bridge", MODE_PRIVATE); }
    private final Runnable refresh = new Runnable() {
        public void run() {
            status.setText(prefs().getString("status", "請先設定音響位址，再啟動橋接。"));
            boot.setChecked(prefs().getBoolean("boot", false));
            handler.postDelayed(this, 1000);
        }
    };

    public void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(64, 32, 64, 24);
        box.setBackgroundColor(Color.rgb(15, 23, 37));
        ScrollView scroll = new ScrollView(this); scroll.addView(box); setContentView(scroll);
        label(box, "Caruso TV Bridge", 30);
        label(box, "Copyright (c) 2026 Adms Chung", 16);
        status = label(box, "", 18);
        label(box, "音量 ± · 開機／切回指定 HDMI 時選光纖 · 關電視進入 Comfort 待機\n不寫入音場、EQ 或擺位設定；播放／暫停維持原本功能。", 18);
        host = field(box, "Caruso 私有 IPv4 位址（必填）", prefs().getString("carusoHost", ""), false);
        hdmi = field(box, "Apple TV 所接 HDMI 輸入（1–4）", String.valueOf(prefs().getInt("hdmiPort", 1)), true);
        device = field(box, "紅外線輸入裝置（先依文件確認）", prefs().getString("inputDevice", "/dev/input/event1"), false);
        deviceName = field(box, "紅外線裝置名稱", prefs().getString("inputName", "mtkinp_ir_events"), false);
        logical = field(box, "Apple TV CEC 邏輯位址（1–14）", String.valueOf(prefs().getInt("cecLogical", 4)), true);
        add(box, "儲存設定", () -> save());
        add(box, "開始橋接／建立本機授權", () -> {
            if (prefs().getBoolean("enabled", false) || save())
                startForegroundService(new Intent(this, BridgeService.class).setAction("start"));
        });
        add(box, "停止橋接（也取消自動啟動）", () ->
            startForegroundService(new Intent(this, BridgeService.class).setAction("stop")));
        boot = new Switch(this); boot.setText("電視完整重新開機後自動啟動（尚需自行驗證）");
        boot.setTextColor(Color.WHITE); boot.setChecked(prefs().getBoolean("boot", false));
        boot.setOnCheckedChangeListener((v, on) -> prefs().edit().putBoolean("boot", on).apply()); box.addView(boot);
        add(box, "顯示本機授權指紋", () -> new Thread(() -> {
            try { String f = LocalAdb.fingerprint(this);
                runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("電視本機 ADB 指紋")
                    .setMessage(f + "\n請在 Android 授權視窗核對此指紋。")
                    .setPositiveButton("好", null).show());
            } catch (Exception e) { runOnUiThread(() -> toast(e.getClass().getSimpleName())); }
        }).start());
        add(box, "授權與署名", () -> {
            try { ByteArrayOutputStream out = new ByteArrayOutputStream();
                try (InputStream in = getAssets().open("NOTICE.txt")) {
                    byte[] bytes = new byte[4096]; int n;
                    while ((n = in.read(bytes)) != -1) out.write(bytes, 0, n);
                }
                new AlertDialog.Builder(this).setTitle("授權與署名")
                    .setMessage(out.toString("UTF-8")).setPositiveButton("好", null).show();
            } catch (IOException e) { toast("授權檔案無法讀取"); }
        });
    }

    private boolean save() {
        if (prefs().getBoolean("enabled", false)) { toast("請先停止橋接，再變更設定。"); return false; }
        try {
            BridgeConfig c = new BridgeConfig(host.getText().toString().trim(),
                device.getText().toString().trim(), deviceName.getText().toString().trim(),
                Integer.parseInt(hdmi.getText().toString().trim()), Integer.parseInt(logical.getText().toString().trim()));
            prefs().edit().putString("carusoHost", c.host).putString("inputDevice", c.inputDevice)
                .putString("inputName", c.inputName).putInt("hdmiPort", c.hdmiPort).putInt("cecLogical", c.cecLogical).apply();
            toast("設定已儲存在這台電視。"); return true;
        } catch (IllegalArgumentException e) { toast("請檢查位址、HDMI 與輸入裝置設定：" + e.getMessage()); return false; }
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private TextView label(LinearLayout box, String text, int size) {
        TextView v = new TextView(this); v.setText(text); v.setTextSize(size); v.setTextColor(Color.WHITE);
        v.setPadding(0, 12, 0, 12); box.addView(v); return v;
    }
    private EditText field(LinearLayout box, String text, String value, boolean number) {
        label(box, text, 16); EditText e = new EditText(this); e.setText(value); e.setTextColor(Color.WHITE);
        e.setSingleLine(true); e.setInputType(number ? InputType.TYPE_CLASS_NUMBER : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        box.addView(e); return e;
    }
    private void add(LinearLayout box, String text, Runnable action) {
        Button b = new Button(this); b.setText(text); b.setTextSize(18); b.setOnClickListener(v -> action.run()); box.addView(b);
    }
    public void onResume() {
        super.onResume(); handler.post(refresh);
        if (prefs().getBoolean("enabled", false)) startForegroundService(new Intent(this, BridgeService.class).setAction("start"));
    }
    public void onPause() { handler.removeCallbacks(refresh); super.onPause(); }
}
