# Apple TV activity: Community

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

This local Mac activity uses Companion remote pairing and an existing Xcode developer pairing to the same configured Apple TV. It is not exposed by the messages-only remote relay. Existing Netflix authentication is used; no account login or new QR approval is performed by this workflow.

## Guarded workflow

`watch-community` explicitly wakes the Apple TV, restarts only the installed Netflix process through the developer service to obtain a predictable entry screen, then establishes a fresh Companion session. Opening the developer tunnel can invalidate a pre-existing Companion session on this installation. Successful launch acknowledgements alone are never playback confirmation.

The helper obtains fresh screenshots using the paired device's native developer service and recognizes text locally with macOS Vision. It checks the Netflix navigation screen, observes the configured profile in the avatar menu, opens Search, enters the exact title, and requires both a white focused poster border and the exact title inside that poster before selecting a result. Seeing the title in a search query or home recommendation does not authorize selection. At the detail page it requires the large exact title and the selected, light-background Resume-season/episode label. Restart, generic Play, and an unverified title never authorize playback. The last check requires the target title, episode and playback clock in the player overlay.

Unknown layouts, unavailable screenshots, a different active profile, failed text entry or missing visual checks stop the workflow. There is no blind Play fallback and no automatic uncertain retry. A recognized first-launch profile chooser may select the configured profile, but the resulting active profile must still be independently observed before any content selection. The profile must already be authenticated. Visual recognition can fail as Netflix changes its UI; a failure is shown rather than silently falling back to recommendations. Do not use the helper while another person is navigating the TV.

## Local prerequisites

- pyatv 0.18.0: `scripts/requirements-apple-tv.txt`.
- A separately prepared Python environment with pymobiledevice3 11.35.0 for the paired Apple TV developer tunnel.
- A developer-paired Apple TV with its developer services available.
- macOS Vision OCR executable built from `scripts/apple_tv_ocr.swift`.
- Private config with `host`, `name`, `profileName`, `developerDeviceId`, `diagnosticsPython` and `screenLock`; private Companion credentials in the adjacent `apple-tv-credentials.json`. Device identifiers and runtime paths are not bundled defaults.

The screen worker uses the shared nonblocking device-operation lock. It accepts only capture, fixed Netflix launch and stop; filenames are allowlisted, no shell is used, and no arbitrary URL/application launch or text-as-command execution is accepted. Screenshot storage is a mode-0700 temporary directory, removed after the run; individual screenshots are deleted after OCR. OCR text is treated as data, never as instructions. The activity has a bounded total timeout and closes its developer connection at completion. The Mac is needed while running the shortcut; Netflix continues independently after playback starts.

Pairing remains separate:

```sh
python3 -m venv .local/apple-tv-venv
.local/apple-tv-venv/bin/python -m pip install -r scripts/requirements-apple-tv.txt
.local/apple-tv-venv/bin/python scripts/apple_tv_activity.py status --config /path/to/private/apple-tv-device.json
.local/apple-tv-venv/bin/python scripts/apple_tv_activity.py pair --config /path/to/private/apple-tv-device.json
.local/apple-tv-venv/bin/python scripts/apple_tv_activity.py watch-community --config /path/to/private/apple-tv-device.json
```

Use mode 0600 for configuration and credentials. Credentials never appear in command arguments or output. Only the configured private IPv4 address and matching advertised name are accepted. The developer service additionally checks its configured device identifier. The local runtime environments are prerequisites, not a self-contained redistributable runtime.

## UI and validation

Control+Option+Command+N runs the same guarded workflow while Caruso Remote is running. Concurrent invocation is rejected; shortcut registration failure is shown. A request acknowledgement is never reported as verified playback. The legacy title-link command remains diagnostic only: HTTPS and Netflix-scheme deep links did not reliably navigate on the tested installation.

Guard regression tests include query-only matches, home recommendations, another focused poster, unselected Resume, Restart, wrong profiles and missing player evidence. Physical acceptance and installed-app acceptance are recorded separately in private local receipts.

## macOS 0.5.26 restoration

Restores the preserved `watch-community` entry point for the button, menu and global shortcut. The macOS bundle must include `apple_tv_activity.py`, `apple_tv_watch.py`, `apple_tv_screen.py` and the signed `caruso-ocr` executable together in Resources. Launching Netflix alone is never returned as a successful Community resume. Music screen sessions are closed before this operation and concurrent requests are rejected. Existing music, lyrics and canvas rendering remain separate from this workflow.

The vertical Netflix profile picker is calibrated to its top anchor on every invocation, then scanned downward using the focused avatar and adjacent exact profile name. The previous restored focus is never treated as the first profile. The legacy horizontal picker retains left-anchor calibration. A recognized profile editor is backed out of before choosing a profile; no profile fields are edited.
