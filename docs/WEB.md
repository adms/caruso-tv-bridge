# Web and macOS controller

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

## Browser controller

Requires Node.js 22.12 or newer. From `web/`:

```sh
npm ci
CARUSO_HOST=10.0.0.123 npm start
```

`10.0.0.123` is a synthetic example, not a preset receiver. Replace it locally. The browser server requires `CARUSO_HOST`, accepts `PORT` (default 43186), and does not load `.env` files. HTTP/SSE listens only on loopback. It does not discover devices or expose internet control by itself.

## Desktop configuration

Electron accepts `CARUSO_HOST` or a private `devices.json` under `~/Library/Application Support/caruso-remote/`. Start from [devices.example.json](../examples/devices.example.json); replace every example address and path with your own. Keep the actual filename outside source control and restrict it to its owner. Finder can launch a configured packaged app without environment variables. There is no first-run native configuration editor; absent configuration stops startup instead of guessing a household receiver.

The desktop app performs local discovery/reconnection for its configured receiver; see [discovery boundaries](DEVICE-DISCOVERY.md). The USB listener uses your configured VID/PID and consumer usage, not a bundled device identifier. Rotation changes native amplifier volume; press stores the observed level, sends native zero, and restores that level on the next press. See [USB controls](../web/MAC-USB-CONTROLS.md).

For optional Apple TV music/metadata and the guarded Netflix activity, supply your own existing local pairings and Python environments. [apple-tv-device.example.json](../examples/apple-tv-device.example.json) shows the required configuration shape without usable identifiers or credentials. `profileName` is your own Netflix profile, not a name fixed by source. The app-level `appleTV.profileName` is the displayed label; the private device helper file supplies the profile used by the guarded workflow. Keep them consistent. See [Apple TV music](MUSIC-CONTROLS.md), [activity prerequisites](APPLE-TV-ACTIVITY.md) and [TV messages](TV-MESSAGES.md). Pairing or complete screenshot setup is not automatic from source alone.

## Build and signing

Apple Silicon macOS builds require full Xcode command-line tools/SDKs and Node N-API headers. Set `NODE_INCLUDE_DIR` if `node_api.h` is not in a standard Node include directory.

```sh
cd web
npm ci
npm run package:mac
npm run sign:mac:adhoc
```

For Developer ID signing, provide **your own** identity through `CARUSO_MAC_SIGN_IDENTITY` and run `npm run sign:mac`. No identity, certificate or password is bundled. Notarization is a separate step; signing alone does not establish notarization. Runtime prerequisites are not bundled Python environments. Read [third-party notices](../THIRD_PARTY_NOTICES.md) before distributing dependency binaries.

## Control and data boundaries

Browser/sandboxed Electron renderer → guarded loopback HTTP/SSE → LUCI TCP 7777 and native MCU TCP 50001. Host/Origin checks and an in-memory session token protect local mutations. Renderer Node integration is disabled. Reconnect does not replay controls.

The LUCI 0–100 media volume and native 0–63 amplifier volume are distinct; no linear conversion is assumed. Optical sound uses the native amplifier. Optical playback controls route to a separately configured Apple TV only when its external transport is available. Otherwise playback remains disabled for external inputs. Acknowledgements and metadata are not proof of audible playback on every installation.

Sound-setting fields remain read-only/unknown where not verifiably readable. Complete sound-setting backup/restore remains disabled. Observation exports are status records, not restorable settings backups, and may contain private addresses/media data. Do not publish them.
