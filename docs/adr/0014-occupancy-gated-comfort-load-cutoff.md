# ADR-0014: Suspend comfort loads during sleep; clear them on exit

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
- `OCCUPIED_SLEEPING` blocks physical outputs without clearing command intent.
  Returning to `OCCUPIED_ACTIVE` or `OCCUPIED_IDLE` therefore resumes the same
  requested settings immediately, without a device-side Firebase write.
- The gas-alarm override may still force the exhaust fan on locally.
- Water-pump logic and the presence relay remain independent.
- During entry, exit, and vacancy, the device may set only its own
  `devices/lights`, `devices/exhaustFan`, and `devices/airConditioner` leaves to
  boolean `false`.
- RTDB rules do not let a device set those leaves to `true`, write the pump or
  `mainRelay`, or write another room.
- Server Comfort Load Automation retains commands during `OCCUPIED_SLEEPING`.
  It clears them when it observes `EXIT_PENDING`, retaining
  `VACANT_CONFIRMED` as a fallback. Confirmed entry restores the configured
  subset, while wake-up needs no server write because command intent survived.
- The 3D scene displays the occupancy-gated effective state and disables comfort
  controls while the firmware would reject the requested output.
- `settings/automationEnabled` controls server command automation only. It does
  not disable the firmware gate or its exit/vacancy off-only command clearing.
- Firmware-only sleep suspension is not appended to `automationLog`; headline
  savings therefore excludes that transient saving until a separately reviewed
  telemetry and money-accounting design exists.

## Consequences

- Sleep cutoff and wake-up resume are immediate on-device. The dashboard shows
  retained commands as blocked while sleeping, then effective again when active.
- Exit/vacancy command synchronization follows the device's off-only write
  instead of waiting for the one-minute server tick.
- Publishing `database.rules.json` is required before production devices can
  clear their command leaves.
- Device compromise cannot energize a comfort load through this permission; the
  added authority is off-only and room-scoped.
- A command can remain requested while sleeping but cannot energize its physical
  output. Entry, exit, and vacancy still clear disallowed requests.
- The dashboard still has no physical relay acknowledgement. It renders the
  effective state from command plus occupancy policy, with gas as the explicit
  local override.
- The current flash candidate cannot run the legacy "automation OFF, loads stay
  on after exit" baseline because its safety gate is always authoritative.
