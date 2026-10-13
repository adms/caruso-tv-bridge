# Contributing

Keep `Copyright (c) 2026 Adms Chung`, the root MIT license, and third-party notices when adapting or redistributing this project. Clearly identify your modifications.

Use synthetic fixtures and mock TCP services for tests. Never commit home-network addresses, actual device serials, account data, ADB/private signing keys, screenshots, raw runtime logs, SDK binaries, vendor APKs or decompiled source. Device tests need the owner's authorization and a clear distinction between read-only queries and controls.

Run the commands in README before opening a pull request. Include what was actually tested; an APK build alone is not hardware acceptance. Keep sound-setting writes and backup/restore disabled until their behavior is fully understood and independently validated.
