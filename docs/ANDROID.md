# Android TV build and setup

Copyright (c) 2026 Adms Chung

## Build from source

Install JDK 17+, Python 3.9+ and Android SDK Command-Line Tools. Install the platform and tools through the SDK manager:

```sh
sdkmanager "platforms;android-35" "build-tools;35.0.0"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
python3 scripts/test_bridge.py
python3 scripts/build_android.py
```

The builder outputs `build/android/Caruso-TV-Bridge-0.3.0-unsigned.apk`. It does **not** install anything. SDK paths can also be supplied with `--android-jar`, `--aapt2`, and `--d8`. Change `ANDROID_COMPILE_SDK` / `ANDROID_BUILD_TOOLS` to select SDK versions. No SDK binaries are vendored.

Sign with your own key before installation. For a local development key:

```sh
mkdir -p .local
keytool -genkeypair -keystore .local/development.jks -alias development -keyalg RSA -keysize 2048 -validity 3650
# Choose your own key passwords in the prompts. Keep this key outside Git.
"$ANDROID_SDK_ROOT/build-tools/35.0.0/zipalign" -f 4 build/android/Caruso-TV-Bridge-0.3.0-unsigned.apk build/android/aligned.apk
"$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner" sign --ks .local/development.jks --ks-key-alias development --out build/android/Caruso-TV-Bridge-0.3.0.apk build/android/aligned.apk
"$ANDROID_SDK_ROOT/build-tools/35.0.0/apksigner" verify --verbose build/android/Caruso-TV-Bridge-0.3.0.apk
```

Existing installations can only be updated using the same signing key. The repository does not contain the development key used for earlier private builds.

## Install and configure

1. Enable Android's developer/USB debugging option on your TV and approve your computer's ADB connection on-screen. On the reference TV that exposes TCP 5555; other TVs may differ.
2. Use `adb connect "$TV_IP:5555"`, then `adb -s "$TV_IP:5555" install -r build/android/Caruso-TV-Bridge-0.3.0.apk`. `TV_IP` must be set locally, never committed.
3. Confirm the IR input mapping with `adb -s "$TV_IP:5555" shell getevent -lp`. The included profile is `/dev/input/event1`, named `mtkinp_ir_events`; verify the actual input on your TV. Do not publish raw input logs. This app reads only an allowlist of media/volume keys and discards unrelated keys.
4. Open **Caruso TV Bridge**. Set the private Caruso IPv4, HDMI port (1–4), IR path/name and Apple TV CEC logical address. Default logical address 4 is a starting profile, not discovery.
5. Save and start. Approve the **TV app's own** local ADB key in the system dialog; the fingerprint is viewable in the app. It generates its own key in Android's private no-backup storage and connects only to loopback. It does not import your computer's ADB key.
6. Return to Apple TV. Point Siri Remote at the TV for IR volume. Test modest volume steps, standby and wake. The device must support the observed Caruso MCU protocol and report the expected optical source identity.
7. Disconnect the computer's ADB session to verify daily operation is TV-local.

## State and recovery

HDMI events are observed through `dumpsys hdmi_control`; old CEC history does not replay controls. Volume holds are bounded, pending repeats are canceled on release, and unconfirmed mutations are not automatically repeated. The Caruso power button is a toggle: the bridge first queries current power, waits for late state updates, and only toggles a confirmed-on receiver to standby. Wake uses an explicit power-on command.

Stop through the app's **停止橋接** button before changing configuration. Boot auto-start is optional and off by default; a full TV reboot has not been validated. Standby/wake and full reboot are different cases.

The app needs USB/network debugging to remain available for its local supervisor. If authorization is revoked while the headless process is alive, the app may be unable to confirm stopping it. Re-authorize and stop, or fully reboot the TV. Uninstalling alone does not guarantee an already-running shell process immediately exits. This is why uninstall/stop cannot be presented as a verified rollback unless process termination is checked.

Both the TV-local runtime and web controller log locally; exported logs or screenshots may contain your IP, media metadata and usage times. Redact before filing issues.
