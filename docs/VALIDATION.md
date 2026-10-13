# Validation and known limits

Copyright (c) 2026 Adms Chung

## Hardware evidence from the private prototype

A single Sony Android TV / Caruso setup was used during development. Physical Siri Remote volume events were received on the TV and produced confirmed native volume changes. A TV-hosted bounded power test confirmed on → network-reachable Comfort standby → on. A subsequent TV-local foreground-supervised run, with the computer's ADB disconnected, received user acceptance for volume, TV-off standby and wake to optical.

Important evidence boundaries:

- In the final user acceptance log, the TV-off action found the receiver already in standby and correctly sent no toggle. The earlier bounded power test provides the actual on-to-standby write evidence.
- The source was already OPTICAL, so the final run did not prove a transition from another input.
- TV standby/wake was exercised; full reboot auto-start was not.
- No EQ, placement or sound-field writes were implemented or performed. This does not establish a complete before/after settings backup.
- Household IPs, device inventories, precise event times, raw logs and screenshots are intentionally not published.

## Public v0.3.0

This release generalizes the private prototype with required receiver configuration, configurable IR input, HDMI port and CEC logical address. Public-source validation consists of:

- Node tests using mock devices and local TCP servers: LUCI frames, checksums, reconnect without replay, local API access controls, and locked settings backup/restore.
- JVM tests: MCU frames, fragmented responses, cached-versus-current power handling, native volume changes over one connection, already-on/off no-op decisions, bounded holds, fresh CEC events, and configuration validation.
- Android source compilation and unsigned APK packaging. This proves compilation, not device acceptance of the new configuration UI.
- Source-tree privacy checks and a separate secret scan before first publication.

No hardware compatibility claim extends automatically to other TV models, firmware, Caruso variants, HDMI topologies or infrared profiles.
