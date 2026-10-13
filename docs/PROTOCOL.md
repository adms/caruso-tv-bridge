# Protocol implementation notes

Copyright (c) 2026 Adms Chung

The project implements a narrow control subset; it does not provide a general command console.

| Transport | Purpose | Implementation |
| --- | --- | --- |
| TCP 7777 / LUCI | Web media state, volume and transport | `web/protocol.mjs`; LUCI reference attributed in THIRD_PARTY_NOTICES |
| TCP 50001 / MCU | Native volume, power, optical source | `McuProtocol.java`, `McuSession.java` |

MCU command packets use type, destination, source, length, command, data, and an 8-bit additive checksum. APP address is `0xEE`; the supported device master is `0xC2`. Received command packets are acknowledged. Full display queries establish volume max 63 and the reported OPTICAL source identity before mutation.

Observed controls: volume up `0x80`, down `0xA0` with no data, explicit power-on `0xD7`, app power-button toggle `0x81`, reported optical selection `0xDE`. A generic standby command `0xF7` did not produce the expected standby transition on the reference unit and is not used. No ECO/deep-off or sound-setting writes are exposed.

The full display query can return cached power-on before its later current-state update. Power decisions wait for this update window. A toggle is never automatically retried on timeout. This is observed device behavior, not a published manufacturer guarantee.

A locally inspected Android package informed MCU protocol research. Its publisher certificate was not independently authenticated against a trusted official certificate; it was not installed or executed. Neither the package nor recovered source is included. The codec and bridge implementation here are independently written.

Future protocol work should preserve source provenance, use read-only observation first, and distinguish command acknowledgement from confirmed state and audible behavior.
