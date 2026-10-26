# TV text and speech messages

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

## Components

- Mac: Caruso Remote 0.5.1, `/messages` page, `web/tv-messages.mjs`.
- TV: independent `Caruso TV Messages` APK, package `tw.local.carusomessages`, version 0.1.1.
- Existing Caruso TV Bridge is a different package and is not replaced by the messages APK.

The TV runs a foreground receiver on TCP 43719, draws a non-focusable, non-touchable Android application overlay and uses Android TextToSpeech in `zh-TW`. The code never starts an HDMI/source switch, sends a media/power/volume command or requests audio focus. Speech uses per-utterance gain. Actual HDMI audio mixing, optical output, HDR and protected-content overlay behavior are **not verified until tested on the physical TV**. TTS `onDone` proves an engine callback, not audible speaker output or uninterrupted HDMI playback.

## Initial installation

Build and sign the new APK. An authorized ADB connection is required for network installation:

```sh
python3 scripts/build_android.py --app messages --sdk "$ANDROID_SDK_ROOT"
adb -s "$TV_ENDPOINT" install -r build/android-messages/Caruso-TV-Messages-0.1.1.apk
```

The builder outputs the `-unsigned.apk`; supply your own signing step to produce the file installed above. `scripts/SignMessages.java` accepts a caller-supplied Android apksig jar and PKCS12 key alias `messages`, reading `CARUSO_MESSAGES_SIGNING_PASSWORD` from the environment. Build inputs and keys are not shipped in source. The local development signing key is private under `.local/` and must be preserved for subsequent updates.

On the TV, open Caruso TV Messages once:

1. Allow **Display over other apps** through the Android settings screen.
2. Start receiving messages.
3. Display a new Mac pairing code, valid for five minutes and eight attempts.
4. In the Mac app's **電視訊息** page, enter the six-digit code once.
5. Return to the Apple TV HDMI picture before sending a harmless test message.

A successful pair stores a random receiver token in Android private preferences and in the Mac app's owner-only `devices.json`. The browser does not receive it. A new pairing revokes the previous token. Pair codes are consumed after success. No message text or token is logged. The receiver uses HTTP on the trusted local network, so traffic is not encrypted against local packet capture. Do not expose this port to the Internet. Browser-origin requests, chunked requests, duplicate headers and oversized inputs are rejected.

Text is limited to 280 Unicode code points. Display duration is 3–60 seconds; speech volume is 0–100% of the TTS output, independent of receiver/system volume. A new message replaces the previous text and speech. Clear removes both. There is no automatic retry after uncertain delivery. Request IDs suppress duplicate accepted messages. Android or the vendor TTS engine can still affect audio routing; the app does not silently switch to another audio source as a fallback.

The service can restart after process termination via Android START_STICKY, but full-TV-reboot auto-start is not implemented. Start the receiver again after a full reboot; pairing remains saved. Normal standby versus full restart must be tested separately. The sender Mac can close after a message has been accepted: text expiry and speech execution are TV-local.

## Local validation

- `cd web && npm test`: message validation, pairing persistence and secret redaction, origin/token guards, no replay, fake-device/UI/native-control regressions.
- `javac --release 8 -d build/messages-tests android/messages/src/tw/local/carusomessages/LocalHttp.java android/messages/tests/LocalHttpTest.java`, then `java -cp build/messages-tests LocalHttpTest`.
- `python3 scripts/test_bridge.py`: existing TV bridge protocol regression suite.
- Independent Electron UI test: unpaired send disabled, pairing, combined text/speech submission, PIN cleared, no JS errors. This uses a simulated receiver and does not establish TV acceptance.

## Physical acceptance and rollback

With a real Apple TV program playing, verify text-only, speech-only, combined, clear/stop, remote input, playback continuity and optical speaker output. Include HDR/protected content if used. Do not claim inaudible/system-volume-independent speech works without listening acceptance. If mixing fails, keep text-only available and report the audio path as unsupported/unverified rather than changing global TV output settings.

Stop the message receiver through its TV app to close the listener, clear text and stop TTS. It does not stop or uninstall the existing TV bridge. Reinstall only with the same messages signing key. Prior Mac app versions are preserved locally before replacement.
