# ADR-0014: Suspend loads during unresolved exit; clear commands only after confirmed vacancy

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

- Lights and exhaust fan are allowed only in `OCCUPIED_ACTIVE` and
  `OCCUPIED_IDLE`.
- AC is also allowed in `OCCUPIED_SLEEPING`, where it continues to follow its
  retained Firebase command.
- `OCCUPIED_SLEEPING` blocks physical light/fan outputs without clearing their
  command intent. Returning to `OCCUPIED_ACTIVE` or `OCCUPIED_IDLE` therefore
  resumes those requested settings immediately, without a device-side
  Firebase write.
- All three comfort loads are blocked in `VACANT`, `ENTRY_DETECTED`,
  `EXIT_PENDING`, and `VACANT_CONFIRMED`.
- `EXIT_PENDING` blocks physical outputs but retains command intent. If the
  door closes and presence is detected, `OCCUPIED_ACTIVE` resumes the same
  requested settings immediately.
- While sleeping, PIR or a newly triggered ultrasonic near reading must remain
  detected for two seconds before the firmware returns to
  `OCCUPIED_ACTIVE`. Ultrasonic must first observe a clear reading after sleep
  begins, preventing an already-near sleeping guest from causing an
  active/sleep oscillation.
- The gas-alarm override may still force the exhaust fan on locally.
- Water-pump logic and the presence relay remain independent.
- During entry and confirmed vacancy, the device may set only its own
  `devices/lights`, `devices/exhaustFan`, and `devices/airConditioner` leaves to
  boolean `false`.
- RTDB rules do not let a device set those leaves to `true`, write the pump or
  `mainRelay`, or write another room.
- Server Comfort Load Automation retains commands during
  `OCCUPIED_SLEEPING` and `EXIT_PENDING`. It clears them when it observes
  `VACANT_CONFIRMED`. Confirmed entry restores the configured subset, while
  wake-up or a cancelled exit needs no server write because command intent
  survived.
- The 3D scene displays each device's occupancy-gated effective state. During
  sleep it blocks lights/fan controls while leaving AC available.
- `settings/automationEnabled` controls server command automation only. It does
  not disable the firmware gate or its confirmed-vacancy command clearing.
- Firmware-only sleep suspension is not appended to `automationLog`; headline
  savings therefore excludes that transient saving until a separately reviewed
  telemetry and money-accounting design exists.

## Consequences

- Sleep light/fan cutoff and wake-up resume are immediate on-device. The
  dashboard shows their retained commands as blocked while sleeping, while a
  commanded AC remains effective.
- Confirmed-vacancy command synchronization follows the device's off-only
  write instead of waiting for the one-minute server tick.
- Publishing `database.rules.json` is required before production devices can
  clear their command leaves.
- Device compromise cannot energize a comfort load through this permission; the
  added authority is off-only and room-scoped.
- Light/fan commands can remain requested while sleeping but cannot energize
  their physical outputs. The AC command remains effective. `EXIT_PENDING`
  retains all three requests while blocking their outputs; entry and confirmed
  vacancy clear disallowed requests.
- The dashboard still has no physical relay acknowledgement. It renders the
  effective state from command plus occupancy policy, with gas as the explicit
  local override.
- The current flash candidate cannot run the legacy "automation OFF, loads stay
  on after confirmed exit" baseline because its safety gate is always authoritative.
