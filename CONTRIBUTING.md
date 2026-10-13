# Contributing

## Contribution licensing

Unless explicitly stated otherwise, contributions intentionally submitted for inclusion in this project are offered under the Apache License, Version 2.0, without additional terms, as described in section 5 of [LICENSE](LICENSE). This applies to original code, documentation and other original project material. Contributors retain copyright in their contributions; submitting a contribution does not transfer ownership to Adms Chung.

By submitting a contribution, confirm that you created it or otherwise have the right to submit it under its applicable license, including any required employer or other rights-holder permission. Identify imported third-party material, its source, license and any modifications. Contributions to files explicitly governed by a third-party license, including vendored AdbLib, must preserve and use that file's existing license unless separately agreed with the relevant rights holders; do not relabel those files as Apache-2.0.

If material is not intended as a contribution, clearly mark it **Not a Contribution**. Raise any different proposed licensing terms before inclusion. This project does not currently require a separate CLA or DCO sign-off.

## Attribution and redistribution

Preserve `Copyright (c) 2026 Adms Chung`, applicable contributor notices, the project source attribution in [NOTICE](NOTICE), and third-party notices. When redistributing original project material, include Apache-2.0 and follow its section 4 requirements, including prominent change notices in modified files. You may add copyright notices for your own contributions. See [the attribution guide](docs/ATTRIBUTION.md) for citation suggestions and the distinction between license obligations and recommended credit.

## Development and privacy

Use synthetic fixtures and mock TCP services for tests. Never commit home-network addresses, actual device serials, account data, ADB/private signing keys, screenshots, raw runtime logs, SDK binaries, vendor APKs or decompiled source. Device tests need the owner's authorization and a clear distinction between read-only queries and controls.

Run the commands in README before opening a pull request. Include what was actually tested; an APK build alone is not hardware acceptance. Keep sound-setting writes and backup/restore disabled until their behavior is fully understood and independently validated.

When updating license or notice files, synchronize the copies in `web/licenses/`. Before distributing binaries, follow the packaging guidance in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and verify the actual archive contents.
