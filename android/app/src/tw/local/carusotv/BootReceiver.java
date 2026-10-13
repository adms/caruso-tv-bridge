// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusotv;
import android.content.*;
public final class BootReceiver extends BroadcastReceiver {
 public void onReceive(Context c,Intent i){android.content.SharedPreferences p=c.getSharedPreferences("bridge",Context.MODE_PRIVATE);if(Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())&&p.getBoolean("enabled",false)&&p.getBoolean("boot",false))c.startForegroundService(new Intent(c,BridgeService.class).setAction("boot"));}
}
