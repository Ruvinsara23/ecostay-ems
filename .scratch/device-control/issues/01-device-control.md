# 01 — Device control: owner flips the room's relays

Status: ready-for-human (implemented 2026-07-04 — awaiting human review + live relay test)
Slice: 1 of 1 (tracer bullet through port → fake → UI → adapter → rules)

## Parent

`.scratch/device-control/PRD.md` — Device control.

## What to build

A Controls card on the room live view with a switch per controllable relay — **Lights,
Exhaust fan, Water pump, Presence relay** (`lights`, `exhaustFan`, `waterPump`,
`motionDetection`; `mainRelay` excluded at the type level). Approved semantics:

- Switch state = **commanded state**, subscribed live from `devices/*` (sessions stay in sync;
  RTDB echoes local writes). No invented acks. Presence relay row also shows the actual
  `relayStatus` from telemetry.
- Controls **disabled while offline** (freshness from slice 04) — no queued commands.
- Gas alarm (> 300): Exhaust fan row notes "forced on by device"; command stays writable.
- Failed writes surface an error and the switch snaps back to subscribed truth.

## Acceptance criteria

- [ ] Four switches with correct labels; `mainRelay` is impossible to target (type-level).
- [ ] Switches reflect the subscribed commanded state and update when it changes externally.
- [ ] Toggling writes exactly one boolean leaf via the port; UI follows the subscription echo.
- [ ] Presence relay shows commanded and actual (`relayStatus`) side by side.
- [ ] Offline room → all switches disabled with an explanatory note.
- [ ] Gas alarm → forced-on note on the Exhaust fan row.
- [ ] Write failure → visible error, no phantom state change.
- [ ] Emulator: member command write round-trips through the rules; **non-member write is
      denied**; device (anonymous) can still read `devices/*`.
- [ ] `npm test`, typecheck, lint, build green; UI never imports the Firebase SDK.

## Blocked by

None — walking skeleton (01–04) is complete.

## Comments

**2026-07-04 (agent) — implemented via TDD, all acceptance criteria green.**

- Verification: **87 unit tests** + **20 emulator integration tests** (member command
  round-trip, non-member write DENIED by rules, mainRelay filtered from the subscription,
  plus all prior suites), typecheck, lint, `next build` — all green.
- `DeviceCommandKey` excludes `mainRelay` at the type level; adapter filters it defensively
  on read too. Controls card: knob-only switches (state via aria-checked), commanded state
  from the `devices/*` subscription, presence relay shows Actual from telemetry, offline
  disables all controls with the no-queuing explanation, gas alarm marks the fan
  "forced on by device during the alarm", failed writes alert and snap back.
- **Remaining for the human**: review + commit is done agent-side (local commit follows);
  the physical check — flip Lights from the dashboard with the ESP32 online and watch
  GPIO13's relay click — happens whenever the bench is next powered (relays are active-LOW;
  simulator ignores commands, so it's safe for UI rehearsal).
