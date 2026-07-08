# 05 - Real PZEM-004T readings draft

Status: pending-human-approval
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Replace `updatePzemDummyReading()` with real PZEM-004T voltage/current/power/energy reads
while preserving the existing telemetry field names and numeric types.

## Scope

- Add the PZEM-004T read path using the human-approved Arduino library and hardware wiring.
- Keep `voltage`, `current`, `power`, and `energy` as numeric fields.
- Keep the 3-second PZEM/update cadence aligned with existing latest writes.
- Guard failed/NaN reads so the firmware never writes invalid JSON values.
- Do not add energy history writes from firmware; charts still use the server sampler.

## Open Design Decision

Human must choose the PZEM Arduino library and confirm target UART pins/wiring before
implementation. Do not add library-specific code until that decision is made.

## Risk Gates

- #7 Firmware.
- #8 Money-facing math indirectly: cost/savings become real only after human verifies meter wiring/readings.

## Hardware / Human Need

Requires physical PZEM-004T hardware and PCB/bench wiring. Code can be drafted, but this
slice cannot be called done without hardware verification. A real compile check is only
claimable if `arduino-cli`, the ESP32 core, the Firebase/DHT libraries, and the selected
PZEM library are installed/configured. If not, record compile as "not run" and do static
review only.

## Test Plan

- Static review that telemetry field names/types and cadence are unchanged.
- Arduino compile only when the local toolchain and selected PZEM library are actually
  available; otherwise explicitly report "not run".
- Bench serial verification: voltage/current/power/energy are finite and plausible.
- Compare a known load against expected wattage range.
- Dashboard verification: simulated label remains until human signs off real PZEM reads.
- Sampler/rollup smoke: energy history receives real cumulative values without negative-delta surprises.

## Stop Before

Do not edit PZEM code or add Arduino library assumptions until human approves risk gate #7
and confirms the target PZEM wiring/library.
