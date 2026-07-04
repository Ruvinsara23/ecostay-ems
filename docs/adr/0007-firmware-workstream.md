# ADR-0007: Approved firmware workstream — provisioning, device credentials, real PZEM

Date: 2026-07-04 · Status: Accepted (Phase 1 grilling) · Amends: ADR-0003

## Context
ADR-0003 froze the firmware contract, allowing changes only as a separately approved
workstream. The grilling interview approved exactly one such workstream, coordinated with
the new PCB design. Three gaps motivate it: hardcoded `property_001`/`room_001` blocks
multi-room; anonymous device auth leaves telemetry forgeable by anyone with the public API
key; PZEM values are simulated (sine wave), so no energy number is real.

## Decision
One firmware workstream, shipped with the PCB units:
1. **Provisioning** — property/room IDs configurable per device (no hardcoded IDs).
2. **Per-device credentials** — email/password identity + `role=device` claim (ADR-0005);
   anonymous sign-in disabled project-wide at cutover; transitional ruleset deleted.
3. **Real PZEM-004T reads** — replace `updatePzemDummyReading()` with actual meter reads.

**The contract shape is untouched**: same paths layout, field names, types, and cadence.
The workstream changes identity and data authenticity only. Until it ships, the UI labels
all energy values "simulated" and the bench node registers as the first room.

## Consequences
- `docs/firmware-contract.md` gains a version note at cutover (identity section changes;
  shape section does not).
- Dashboard work must not block on this: everything is built against the current contract,
  with the "simulated" label and transitional rules as the bridge.
- Savings math (counterfactual avoided energy) becomes fully real only after real PZEM reads;
  until then it is demonstrable with seeded/simulated data clearly labeled as such.
