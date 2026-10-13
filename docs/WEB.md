# Web and macOS controller

Copyright (c) 2026 Adms Chung

The server uses `CARUSO_HOST` (required, private IPv4) and `PORT` (optional, default 43186). No `.env` file is read automatically. Set variables in your shell or your own launcher; do not commit personal configuration.

```sh
cd web
export CARUSO_HOST=10.0.0.123  # synthetic example; replace locally
npm start
# Or, after npm ci:
npm run desktop
```

For a packaged macOS app, launch its executable with the environment variable:

```sh
CARUSO_HOST=10.0.0.123 "web/dist/Caruso Remote-darwin-arm64/Caruso Remote.app/Contents/MacOS/Caruso Remote"
```

A Finder-launched app without that variable shows a configuration error and exits. It does not use a hidden default device. There is currently no native macOS first-run IP settings window.

Architecture: browser or sandboxed Electron renderer → loopback HTTP/SSE → LUCI TCP 7777. Host/Origin checks and an in-memory session token protect local control requests. Reconnect does not replay control commands. Renderer Node integration is disabled.

The settings page has 14 fields with unknown values; none are replaced with fake defaults. Full sound-setting backup and restore return HTTP 409. An observation JSON file is explicitly not a restorable settings backup. File inspection can check structure and checksums but cannot verify a device's identity or unlock restore.

The web volume scale is LUCI 0–100, distinct from the Android bridge's MCU native 0–63. Playback commands are implemented; physical audible behavior depends on the active source and has not been verified for every command. Album art is loaded only from metadata returned by the device and may fall back to a placeholder.
