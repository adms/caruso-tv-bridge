# macOS USB knob controls (0.5.28)

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

The desktop app uses an in-process IOHID module scoped to one configured USB consumer-control device. It observes only volume and selected media usages; it does not record ordinary keyboard input. The signed main app opens only the configured consumer-control interface. Global Input Monitoring preflight is informational: a denied global preflight does not prove that this scoped interface is unavailable. Actual IOHIDManagerOpen failure shows permission guidance; startup never requests permission automatically. A successful open plus a matching present device shows connected. Reconnect restarts only the listener. The OS still enforces the interface access; no permission bypass is used.

Rotate: native Caruso unit-volume steps, limited to eight pending steps. Press: mute/unmute the amplifier that emits the optical TV sound, with held-key suppression and an in-flight lock. The app reads native volume, saves it privately in knob-mute.json (0600, scoped to the device host), and sends the native absolute-volume command 0xA0 with a one-byte zero target. A second press restores the saved native level. Every operation requires actual device readback, with no automatic retries. This uses one volume write rather than a slow series of unit steps. LUCI media volume is not used to mute optical sound. Pre-existing zero without saved restore never invents a volume. Rotation cancels the saved restore and adjusts from the current level. The button's actual HID usage must be verified; the example uses consumer mute (226). Other media usages do not trigger press.

Device addresses and identifiers are local configuration, not bundled defaults. Put `devices.json` in the Electron user-data directory (`~/Library/Application Support/caruso-remote/` on macOS). Example:

```json
{
  "host": "10.0.0.123",
  "tvHost": "10.0.0.124",
  "adbPath": "/usr/local/bin/adb",
  "knob": {"vendor": 0, "product": 0, "pushUsage": 226}
}
```

Use the actual private addresses and USB VID/PID. The knob press no longer invokes the separate legacy TV/receiver group-power helper. Existing TV power synchronization remains independent. Unknown/stale device state and standby never cause a power command or invented audible volume. A failed acknowledgement is reported without automatically repeating a write.

Native status comes from TCP 50001; media metadata and the existing 0–100 volume slider remain on LUCI TCP 7777. The separate original-device volume display and USB knob use the native 0–63 scale. No linear conversion between these scales is assumed. Playback is blocked at both UI and server for standby, unknown state and external inputs, including optical.

## Validation boundaries

Automated fake-device tests cover framing, extended source commands, cached power, source identity, optical playback blocking, held-button suppression and group-power failure handling. A live read verified native state and the source catalog. A physical read-only capture identified volume-up, volume-down and mute/push from the configured USB consumer interface. Physical mute/restore acceptance is recorded separately from fake-device tests. Automated tests do not establish that acceptance.

Build with `npm run package:mac`, then `npm run sign:mac`. The native N-API module is project code; it and the application are signed using the same selected identity. No device configuration or debug keys belong in a distributable build.
