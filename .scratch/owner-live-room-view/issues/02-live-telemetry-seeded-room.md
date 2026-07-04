# 02 — Live telemetry for the seeded Room

Status: ready-for-human (implemented 2026-07-04 — awaiting human review; live-device verify blocked on ESP32 reflash)
Slice: 2 of 4
Covers user stories: 10, 15–26, 32–34

## Parent

`.scratch/owner-live-room-view/PRD.md` — Owner live room view (walking skeleton).

## What to build

The core tracer bullet: a signed-in Owner watches the seeded Room's live telemetry, read straight
from the firmware-fed `latest` snapshot and updating on its own as the device writes.

End-to-end behavior:

- The dashboard subscribes to the seeded Room's `latest` and renders its current telemetry, grouped
  sensibly: occupancy state and a derived plain-language **Occupied / Vacant** summary; temperature
  and humidity; gas reading shown against its alarm threshold (>300); power and energy; water level
  and flow rate; door open/closed, motion, and human-presence; relay and buzzer status. Values carry
  sensible units (°C, %, W, kWh, L/min).
- **Power and energy are clearly labelled *simulated*** (per ADR-0003), so dummy values are never
  mistaken for a real meter. Contract honesty extends to the other known quirks (e.g. `lightLevel`
  is always 0, `relayStatus` reflects only the presence relay) — present them truthfully, don't hide
  the seams.
- The view **updates itself** within a few seconds of a new firmware write — no manual refresh.
- The dashboard **never re-derives** occupancy or invents readings the firmware doesn't send; the
  device is the single source of truth. `Occupied` uses exactly firmware's `isOccupiedState()`
  predicate: `occupancyState ∈ {ENTRY_DETECTED, OCCUPIED_ACTIVE, OCCUPIED_IDLE, OCCUPIED_SLEEPING,
  EXIT_PENDING}`.
- A first-load spinner shows while the initial snapshot arrives; a distinct empty state shows when the
  Room has never reported (no `latest` yet); a single missing or malformed field does not blank the
  whole view.
- Room is fixed to the seeded `property_001/room_001` for this slice (tenancy-driven selection arrives
  in Slice 3), so the Owner lands directly on it.

New machinery introduced here:

- **Firmware-contract TypeScript types** encoding the `latest` payload (every field from
  `docs/firmware-contract.md`, exact names and types) and the seven `occupancyState` string literals.
  Per ADR-0002 these types are the compile-time guard against field-name drift; they mirror the
  contract verbatim.
- **`RoomDataSource.subscribeLatest(propertyId, roomId, cb)`** port (returns an unsubscribe) — the
  RTDB read seam from the PRD. A real adapter wraps `firebase/database` `onValue`; an in-memory fake
  drives UI tests. Provided via context so tests inject the fake.
- **`isOccupied(occupancyState)`** pure function, unit-tested across all seven states.

## Acceptance criteria

- [ ] A signed-in Owner sees the seeded Room's live telemetry with all contract fields present and correctly unit-labelled.
- [ ] The occupancy state is shown and a derived Occupied/Vacant summary matches the firmware predicate for all seven states.
- [ ] Power and energy are visibly labelled simulated; gas is shown with its >300 alarm threshold.
- [ ] When the fake/real source emits a new `latest`, the rendered values update without a manual refresh.
- [ ] A first-load spinner, a distinct never-reported empty state, and resilience to a single malformed field are all demonstrated by tests.
- [ ] Firmware-contract types compile-encode the `latest` payload; a field-name drift is a typecheck error.
- [ ] `RoomDataSource` has an in-memory fake (UI tests) and a real `firebase/database` adapter (never imported by the UI directly).
- [ ] An RTDB-emulator integration test writes to `properties/property_001/rooms/room_001/latest` and asserts it surfaces through `subscribeLatest` with the correct types.
- [ ] `isOccupied` is unit-tested for every occupancy state; `npm test` and `npm run typecheck` are green.

## Blocked by

- `.scratch/owner-live-room-view/issues/01-owner-authentication-bootstrap.md`

## Comments

**2026-07-04 (agent) — implemented via TDD, all acceptance criteria testable-green.**

- 8 red→green cycles. Verification: **56 unit tests** (fake-backed) + **13 emulator integration
  tests** (Auth + RTDB) + typecheck, lint, `next build` all green.
- Firmware-contract types (`src/telemetry/contract.ts`) mirror `latest` verbatim; `isOccupied`
  matches the firmware predicate for all seven states; unknown states render '—', never a guess.
- `RoomDataSource` port emits `Partial<RoomTelemetry> | null` — the type itself forces per-field
  resilience in the view. Fake + real `firebase/database` adapter; UI imports the port only.
- The RTDB integration tests run **through the transitional ruleset** (`database.rules.json`):
  they prove a membership-holding owner can read `latest` and that firmware-shaped writes surface
  typed through `subscribeLatest`. Emulators need Java 21 — portable Temurin JRE documented in
  AGENTS.md environment notes.
- View renders all contract groups with units, "Simulated" badge on the PZEM group (ADR-0003),
  gas alarm banner above 300, light level honestly "No sensor", distinct loading /
  never-reported states.
- **Remaining for the human**: reflash the ESP32 (new API_KEY/DATABASE_URL already edited into
  firmware/complete.ino) — then verify live: dashboard shows real telemetry updating every ~3 s
  in the `ecostay-ems` project. Freshness/offline honesty is slice 04.
