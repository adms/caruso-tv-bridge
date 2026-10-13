# Third-party notices

Original project code: **Copyright (c) 2026 Adms Chung**, MIT; see LICENSE and NOTICE.

| Component | Source | License / retained copyright | Scope |
| --- | --- | --- | --- |
| AdbLib | [cgutman/AdbLib](https://github.com/cgutman/AdbLib/tree/d6937951eb98557c76ee2081e383d50886ce109a) | BSD 3-Clause; Copyright (c) 2013, Cameron Gutman | Vendored Java under `android/app/src/com/cgutman/adblib/` |
| aiolibresync LUCI reference | [protocol-media.md](https://github.com/drsound/aiolibresync/blob/main/docs/protocol-media.md) | MIT; Copyright (c) 2026 Alessandro Zarrilli | Wire-format research for the web controller; retained notice in `LICENSES/aiolibresync-MIT.txt` |
| Electron and @electron/packager | npm dependencies pinned by `web/package-lock.json` | Their upstream notices are distributed with installed dependencies | Optional desktop build dependencies; not vendored |

Full retained texts are in `LICENSES/`. The Android builder embeds the project and third-party notices in APK assets; the app can show them. Desktop packaging retains copies in `web/licenses/`.

AdbLib is pinned to commit `d6937951eb98557c76ee2081e383d50886ce109a`. Local modifications address concurrent stream tracking, serialized packet writes, stream-open races, closure visibility, and draining already-received data after a peer closes. Copyright for these modifications: Adms Chung, 2026, under the upstream BSD-3-Clause terms. Upstream copyright is preserved.

No vendor APK, recovered vendor source, firmware, SDK binary, manufacturer artwork, signing key, or account credential is distributed. This is an independent project; product names identify compatible devices, not affiliation or endorsement.
