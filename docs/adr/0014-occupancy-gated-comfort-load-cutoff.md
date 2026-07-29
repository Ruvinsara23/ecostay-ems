# ADR-0014: Cut comfort loads during sleep, exit, and vacancy

Date: 2026-07-29 · Status: Accepted · Amends: ADR-0012, ADR-0013

## Context

The approved flash candidate previously allowed requested lights, exhaust fan,
and air conditioner commands through `OCCUPIED_SLEEPING` and `EXIT_PENDING`.
That left comfort loads running after the guest went to sleep or began leaving.

The firmware can block its physical relay outputs immediately, but the dashboard
subscribes to the Firebase command leaves. A local relay cutoff alone therefore
left the dashboard showing `Cmd On`. Device accounts were also read-only under
`devices/*`, so firmware attempts to clear those command leaves were rejected.

## Decision

- Comfort loads are allowed only in `OCCUPIED_ACTIVE` and `OCCUPIED_IDLE`.
- Lights, exhaust fan, and AC are blocked in `VACANT`, `ENTRY_DETECTED`,
  `OCCUPIED_SLEEPING`, `EXIT_PENDING`, and `VACANT_CONFIRMED`.
- The gas-alarm override may still force the exhaust fan on locally.
- Water-pump logic and the presence relay remain independent.
- When comfort loads are blocked, the device may set only its own
  `devices/lights`, `devices/exhaustFan`, and `devices/airConditioner` leaves to
  boolean `false`.
- RTDB rules do not let a device set those leaves to `true`, write the pump or
  `mainRelay`, or write another room.
- Server Comfort Load Automation cuts the same three commands when it observes
  `OCCUPIED_SLEEPING` or `EXIT_PENDING`, while retaining
  `VACANT_CONFIRMED` as a fallback. It restores only on an approved transition
  to `OCCUPIED_ACTIVE` or `OCCUPIED_IDLE`.
- The 3D scene displays the occupancy-gated effective state and disables comfort
  controls while the firmware would reject the requested output.

## Consequences

- Physical cutoff is immediate on-device; dashboard command synchronization
  follows the device write instead of waiting for the one-minute server tick.
- Publishing `database.rules.json` is required before production devices can
  clear their command leaves.
- Device compromise cannot energize a comfort load through this permission; the
  added authority is off-only and room-scoped.
- A manually requested comfort command cannot remain on while occupancy is in a
  blocked state. This intentionally narrows the prior transition-epoch override
  behavior.
- The dashboard still has no physical relay acknowledgement. It renders the
  effective state from command plus occupancy policy, with gas as the explicit
  local override.
