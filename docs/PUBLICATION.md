# Public source preparation

Copyright (c) 2026 Adms Chung. SPDX-License-Identifier: Apache-2.0.

This is a **source snapshot**, not a signed/notarized binary release or a claim of compatibility with all receivers and TVs. The public source contains no preset household equipment or paired account. README languages remain English, German, Italian, French, Japanese and Traditional Chinese; the app UI is primarily Traditional Chinese.

## Public versus private

Publish source, tests, generic examples, the project icon, license texts and documentation. Keep the following local:

- Device addresses, advertised names, unique identifiers, USB configuration and selected streaming-service profile.
- Apple TV Companion/AirPlay/developer pairings, Android ADB keys, TV message tokens and relay authentication configuration.
- Apple signing identities, certificates, provisioning profiles, keychains, Android signing keys and passwords.
- Application preferences, cached lyrics/artwork, current-song data, screenshots, OCR output, logs, backups and device-test receipts.
- Installed Python environments, Node dependencies, SDKs and generated native modules, apps, APKs and archives.

Local data remains available to the installed app and is excluded using `.gitignore`; preparation does not erase working pairings. Generated icon assets retain their compressed pixel data, but EXIF and embedded generation-provenance containers are removed. Original private copies are kept only in the ignored local audit directory.

## Repeatable checks and export

From the repository root:

```sh
python3 -m unittest discover -s scripts/tests
node --test web/test/*.test.mjs
python3 scripts/test_bridge.py
python3 scripts/check_public_tree.py --history
python3 scripts/export_public_source.py
```

The source policy inspects tracked **and untracked, non-ignored** publication candidates. It refuses personal home paths, unexpected private IP literals, literal device identifiers, common credential formats, key/build/runtime files, unlisted binary assets, symlinks and nonvisual icon metadata. Explicit synthetic fixture addresses are allowed; none is an automatic connection target. Reports identify paths and reasons without echoing matched secrets. The history option checks all reachable Git blob objects in local refs. It does not inspect unreferenced/dangling objects, remote-only refs or inaccessible hosting-service logs.

The exporter stops on policy findings and creates a ZIP containing only the checked source plus a SHA-256 manifest. It omits `.git`, runtime settings, ignored content, logs, installed apps and pairing data. The ZIP is suitable for source review or upload; building/signing/distributing binaries is a separate process. Git author attribution and `Copyright (c) 2026 Adms Chung` are intentional public authorship.

A clean working tree alone cannot remove a secret that was previously committed or uploaded. If a later scan finds one, revoke the credential and review history/remotes before publication. Pattern checks are not a proof that arbitrary unknown secrets can never exist; review changes and rerun them immediately before pushing. This workflow does not push, merge or change the installed app.

## Fresh installation

Start with [generic configuration examples](../examples/) and [desktop setup](WEB.md). Supply your own addresses, private profile name and signing identity. Pair through each platform's normal local confirmation flow; no working account or device authorization is distributed.
