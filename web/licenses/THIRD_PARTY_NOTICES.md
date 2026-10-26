# Third-party notices

Original project material: **Copyright (c) 2026 Adms Chung**, Apache-2.0; see LICENSE and NOTICE. This covers original code, scripts, documentation and diagrams unless a file is explicitly identified otherwise. The project's license change does not relicense third-party material or replace its authors' notices.

## Components and research sources

| Component | Source / version | License / retained copyright | Scope |
| --- | --- | --- | --- |
| AdbLib | [cgutman/AdbLib](https://github.com/cgutman/AdbLib/tree/d6937951eb98557c76ee2081e383d50886ce109a) | BSD-3-Clause; Copyright (c) 2013, Cameron Gutman | Vendored Java under `android/app/src/com/cgutman/adblib/`; included in Android builds |
| aiolibresync LUCI reference | [protocol-media.md](https://github.com/drsound/aiolibresync/blob/main/docs/protocol-media.md) | MIT; Copyright (c) 2026 Alessandro Zarrilli | Wire-format research for the web controller; no aiolibresync runtime dependency |
| Electron | [electron/electron](https://github.com/electron/electron), npm 44.7.0 | MIT; Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc. | Optional desktop runtime; npm version pinned in `web/package-lock.json` |
| @electron/packager | [electron/packager](https://github.com/electron/packager), npm 20.3.0 | BSD-2-Clause; Copyright (c) 2015 Max Ogden and other contributors | Desktop build tool; npm version pinned in `web/package-lock.json` |

Retained license texts are in `LICENSES/AdbLib-BSD-3-Clause.txt`, `LICENSES/aiolibresync-MIT.txt`, `LICENSES/Electron-MIT.txt` and `LICENSES/electron-packager-BSD-2-Clause.txt`. The Electron and packager texts were copied from the LICENSE files in the exact npm package versions listed above. A reference here does not imply that every listed component is included in every build.

AdbLib is pinned to commit `d6937951eb98557c76ee2081e383d50886ce109a`. Local modifications address concurrent stream tracking, serialized packet writes, stream-open races, closure visibility, and draining already-received data after a peer closes. **Copyright (c) 2026 Adms Chung** applies to these modifications under the upstream **BSD-3-Clause** terms. Upstream copyright is preserved; these files are an explicit exception to the project's Apache-2.0 license.

## Optional Apple TV Python runtimes

- **pyatv 0.18.0**, MIT, [project and license](https://github.com/postlund/pyatv). Used through a separately installed Python environment for Apple TV remote commands and metadata. The retained upstream MIT text is `LICENSES/pyatv-MIT.txt`.
- **pymobiledevice3 11.35.0**, GPL-3.0-or-later, [upstream license](https://github.com/doronz88/pymobiledevice3/blob/master/LICENSE). Used by the optional developer-screen helper through a separately installed Python environment. No pymobiledevice3 code, Python environment, developer pairing, or dependent binary is included in this source export or the desktop bundle. Its license remains separate; do not bundle that runtime under the project's Apache-2.0 notice.
- macOS Vision, ImageIO, IOKit and CoreFoundation are Apple system frameworks, not vendored source. Native helpers are built from this project's source and require the user's local SDK/build tools.
- LRCLIB supplies third-party lyric data at runtime. Cached lyrics, provider artwork and listening records are private runtime data and are excluded from the source export. The project does not grant rights in that content.
- `web/assets/caruso-*.png` and `caruso.icns` are the project's generated icon assets. Nonvisual metadata has been removed; these assets do not include manufacturer-provided product artwork.

## Source and binary distributions

- Source distributions retain LICENSE, NOTICE, this file and the applicable texts in LICENSES/. Do not replace third-party author notices with the project's copyright or license.
- The Android builder embeds LICENSE, NOTICE, this file and the retained third-party license texts in APK assets. The app's license dialog shows these notices and texts. Android SDK/JDK tools are build inputs and are not vendored in this repository.
- Desktop packaging includes project and dependency notices from `web/licenses/`. Copies there must match the root files and LICENSES/ before packaging.
- Electron includes Chromium, Node.js and other components with their own terms. An actual desktop release must retain the license and third-party notice files supplied with the exact Electron runtime, including its `LICENSE` and `LICENSES.chromium.html` where supplied. The short Electron MIT text alone is not the complete runtime notice collection.
- `web/package-lock.json` records npm dependencies and their license metadata; it is not a substitute for their full license texts. If dependency code is shipped, include its applicable notices and satisfy its redistribution terms. Build-only packages need not be represented as bundled runtime code.
- Before publishing an APK or desktop archive, inspect the final artifact for the required notices and identify the versions actually included. Adding this source inventory does not certify an uninspected binary release.

## Brands and excluded material

No vendor APK, recovered vendor source, firmware, SDK binary, manufacturer artwork, signing key, or account credential is distributed in this source repository. This is an independent project; T+A, Apple and Sony product names identify compatibility, not affiliation or endorsement. The software licenses do not grant third-party trademark rights.
