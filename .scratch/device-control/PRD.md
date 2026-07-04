# PRD: Device control (owner flips the room's relays)

Status: ready-for-agent (risk gate #3 approved by human 2026-07-04; semantics locked as below)
Feature slug: device-control
Created: 2026-07-04
Phase: 4 (second vertical feature after the walking skeleton)

> The walking skeleton reads the room; this PRD makes it act. An Owner toggles the room's
> relays from the live view. Commands are the firmware contract's plain boolean leaves under
> `devices/*`, polled by the ESP32 every 500 ms — **these flip real relays in guest rooms**
> (AGENTS.md risk gate #3). Vocabulary is CONTEXT.md's; contract is docs/firmware-contract.md.

## Problem Statement

The Owner can see the room live but cannot act on what they see. Lights left on in a vacant
room, an exhaust fan that should run, a water pump to start — today the only way is walking
to the room. The system already has command paths the device obeys; the dashboard just
doesn't expose them.

## Solution

A Controls card on the room's live view with a switch per controllable relay: **Lights,
Exhaust fan, Water pump, and the Presence relay**. Flipping a switch writes the command
boolean; the device applies it within ~1 second. The UI is honest about what a command is:
it shows the **commanded state** (read live from `devices/*`, so two open dashboards stay in
sync) and never pretends to know the relay actually moved — except the presence relay, whose
real state (`relayStatus`) the telemetry does report and which is shown alongside. While the
room is **offline, controls are disabled** (a queued command firing on reconnect is a hazard
— grilled decision). During a **gas alarm** the exhaust fan control is marked "forced on by
the device" (the firmware's local override always wins).

## User Stories

1. As an Owner, I want to switch the room's lights on/off from the dashboard, so that I don't walk to the room.
2. As an Owner, I want to control the exhaust fan, so that I can air the room on demand.
3. As an Owner, I want to control the water pump, so that I can fill the tank when needed.
4. As an Owner, I want to control the presence relay, so that I can drive its circuit manually.
5. As an Owner, I want each switch to show the current commanded state, so that I know what the device has been told.
6. As an Owner, I want the presence relay's *actual* state shown next to its command, so that I can see command and reality side by side (the one relay telemetry reports).
7. As an Owner, I want switches in a second browser tab to update when I flip one here, so that all sessions agree.
8. As an Owner, I want controls disabled with an explanation while the room is offline, so that no command lands unpredictably on reconnect.
9. As an Owner, I want the exhaust fan control to tell me when the gas alarm has forced it on, so that I understand why my OFF command has no visible effect.
10. As an Owner, I want a clear error if a command write fails (e.g. permission/network), so that I don't assume it worked.
11. As an Admin, I want the same controls on any room I view, so that I can support owners.
12. As the system, I want `mainRelay` never shown or written, so that we don't pretend to control a relay the firmware ignores (ADR-0003).
13. As the system, I want command writes rejected by security rules for non-members, so that control is tenant-isolated server-side, not just in the UI.
14. As a Guest, I keep interacting only physically — my wall behavior is unchanged by any of this.

## Implementation Decisions

- **Port extension, same seam**: `RoomDataSource` gains
  `subscribeDeviceCommands(propertyId, roomId, cb)` (emits the `devices/*` booleans as a
  partial record, immediately-then-on-change) and
  `setDeviceCommand(propertyId, roomId, key, on)` (writes one boolean leaf, resolves/rejects).
  UI still never imports the Firebase SDK.
- **Contract types**: a `DeviceCommandKey` union of exactly `exhaustFan | motionDetection |
  lights | waterPump` — `mainRelay` is deliberately not a member (compile-time exclusion).
  UI labels: Lights, Exhaust fan, Water pump, Presence relay (motionDetection's real effect).
- **Honesty rules**: switch state = commanded state from the subscription (RTDB echoes local
  writes instantly, so no separate optimistic state). No acks are invented; the presence
  relay row also shows telemetry `relayStatus`. A failed write surfaces an error and the
  switch snaps back to the subscribed truth.
- **Offline**: `deviceFreshness` (slice 04) gates the whole Controls card — disabled + note
  when offline or never-reported. No command queuing, ever (grilled decision).
- **Gas alarm**: when `gas > 300`, the Exhaust fan row shows a "forced on by device" note;
  the command remains writable (it takes effect when the alarm clears) but the note explains
  the override.
- **Rules**: already published — members/admins may write `devices/*`; the device reads them
  anonymously. No rules change in this PRD; the emulator suite gains a *negative* test (a
  non-member's command write is denied).
- **No new pages**: the Controls card joins the existing room live view.

## Testing Decisions

- Same seam discipline as the skeleton: UI tests drive the fake `RoomDataSource` (which
  gains command state + a failure mode); assertions are behavioral (switch reflects
  subscription, write called with the right key, disabled-offline, error revert, forced-fan
  note). No Firebase imports in UI tests.
- Emulator integration: a member's `setDeviceCommand` lands at
  `properties/.../devices/lights` and round-trips through `subscribeDeviceCommands`; a
  non-member's write is **rejected by rules**; anonymous (device) read of `devices/*` still
  allowed. Runs under the existing `npm run test:integration` harness.
- Prior art: `room-live-view.test.tsx` (view behavior), `firebase-room-data-source.integration.test.ts`
  (rules-aware adapter tests), `fake-room-data-source.test.ts` (fake behavior).
- TDD red→green per slice; `npm test` + typecheck green before every commit.

## Out of Scope

- **Automation** (vacancy cutoff etc.) — Cloud Functions phase (ADR-0006), after this.
- **mainRelay** — excluded until the firmware workstream wires it (ADR-0007).
- Command history/audit log, schedules/timers, per-circuit wattage config (savings phase).
- UI redesign — controls ship in the current plain style; issue 05 restyles them later.
- Any firmware change; any rules change.

## Further Notes

- Demo caution (risk gate): every toggle fires a physical relay if the bench device is
  online. Verify with the simulator first (it ignores commands — safe), then live.
- This PRD unlocks the automation executor later: automation writes the same `devices/*`
  leaves the UI does, with transition-epoch precedence arbitrating between them.
