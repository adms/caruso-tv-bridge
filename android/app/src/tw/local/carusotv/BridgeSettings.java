// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusotv;

import android.content.SharedPreferences;
import tw.local.carusobridge.BridgeConfig;

final class BridgeSettings {
    static BridgeConfig read(SharedPreferences p) {
        return new BridgeConfig(p.getString("carusoHost", ""),
            p.getString("inputDevice", "/dev/input/event1"),
            p.getString("inputName", "mtkinp_ir_events"),
            p.getInt("hdmiPort", 1), p.getInt("cecLogical", 4));
    }
}
