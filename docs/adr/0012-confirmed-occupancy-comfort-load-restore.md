# ADR-0012: Restore comfort loads after sensor-confirmed occupancy

Date: 2026-07-29 · Status: Accepted · Amends: FR-05 automation in `CONTEXT.md`

## Context

`ENTRY_DETECTED` begins when the door opens. It is an occupied state for room-status
display and presence-relay purposes, but it does not prove that a person entered.

Occupancy Restore previously wrote `lights=true` and `exhaustFan=true` at the
`VACANT_CONFIRMED → ENTRY_DETECTED` transition. If the one-minute automation tick
recorded that candidate state without completing the write, the later
`ENTRY_DETECTED → OCCUPIED_ACTIVE` transition was treated as occupied-to-occupied
and did not restore the loads. This produced a sensor-confirmed occupied room with
the TV presence cue on, but the fan, lights, and measured simulated power off.

The current flash candidate also allowed retained fan/light commands through while
the room was only in `ENTRY_DETECTED`, so opening a door could energize comfort
loads before either PIR or ultrasonic presence was confirmed.

## Decision

- Keep the domain-level `Occupied` predicate unchanged. `ENTRY_DETECTED` remains
  occupied for status display and presence-relay compatibility.
- Occupancy Restore does not act on `ENTRY_DETECTED`.
- Restore `lights` and `exhaustFan` when a vacancy/entry candidate advances to a
  sensor-confirmed state: `OCCUPIED_ACTIVE`, `OCCUPIED_IDLE`, or
  `OCCUPIED_SLEEPING`.
- A late automation tick may restore directly from `VACANT` or
  `VACANT_CONFIRMED` to one of those confirmed states.
- The current flash candidate permits requested comfort loads in
  `OCCUPIED_ACTIVE`, `OCCUPIED_IDLE`, `OCCUPIED_SLEEPING`, and `EXIT_PENDING`,
  but not in `ENTRY_DETECTED`.
- Water-pump automation and the local gas-alarm exhaust-fan override are unchanged.
- No RTDB path, command field, telemetry field, pin assignment, or data type changes.

## Consequences

- Opening the door without detected presence cannot turn on the fan or lights.
- Once PIR or ultrasonic confirms a guest, the next server automation tick restores
  fan and lights. Under ADR-0010 this remains a polling action with approximately
  60 seconds worst-case latency.
- Transition-epoch precedence remains intact: a later manual command stands until
  the next qualifying occupancy transition.
- The dashboard continues to display device command state rather than re-deriving
  or running automation in the browser.
