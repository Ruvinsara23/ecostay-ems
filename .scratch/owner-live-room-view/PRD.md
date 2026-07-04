# PRD: Owner live room view (walking skeleton)

Status: ready-for-agent
Feature slug: owner-live-room-view
Created: 2026-07-04
Phase: 3 (first vertical slice)

> The first vertical slice of EcoStay EMS. An Owner logs in and watches one Room's live
> telemetry, read directly from the firmware-fed `latest` snapshot. This proves the whole
> auth + realtime + firmware-contract path end-to-end before any Cloud Functions, charts,
> alerts, automation, or cost features are built. It is a **read-only** monitoring view —
> device control is the next slice.
>
> Vocabulary is CONTEXT.md's. Respects ADR-0002 (Next.js/TS, types encode the contract),
> ADR-0003 (RTDB + immutable firmware contract), ADR-0005 (auth & tenancy via custom claims),
> and `docs/firmware-contract.md` (ground truth for field names/paths/cadence).

## Problem Statement

An accommodation Owner has an ESP32 node running in a room, writing live telemetry to Firebase
every 3 seconds, but no way to see it. They cannot tell, from where they are, whether the room is
occupied, how warm it is, whether the gas reading is safe, whether water is flowing, or whether the
device is even still online. Today the only "interface" is the physical room itself. The Owner needs
a private, authenticated screen that shows their room's current state at a glance and updates on its
own, and that is honest about which readings are real versus simulated and about when the device has
gone silent.

## Solution

A web dashboard the Owner signs into with an email and password. After signing in they land on a
live view of the Room(s) they are assigned to, showing the latest telemetry snapshot: occupancy
state, temperature and humidity, power/energy (clearly labelled *simulated* until the firmware gains
real PZEM reads), gas level (with its alarm threshold), water level and flow, door state, motion,
and relay/buzzer status. The view updates itself as the firmware writes new snapshots — no refresh.
If the device stops writing, the readings visibly go stale ("last seen 45s ago") rather than
pretending to be live. An Owner only ever sees Rooms in Properties they are a member of; an Admin can
see any Property. This slice is read-only: no device control, no history, no cost, no alerts yet.

## User Stories

**Authentication & session**

1. As an Owner, I want to sign in with my email and password, so that only I can see my Property's data.
2. As an Owner, I want to be kept signed in across page reloads, so that I don't re-enter credentials constantly.
3. As an Owner, I want a clear error when my credentials are wrong, so that I know to retry rather than assume the app is broken.
4. As an Owner, I want to sign out, so that I can leave the dashboard secure on a shared machine.
5. As an Owner, I want any dashboard URL I open while signed out to send me to the login screen, so that data is never shown unauthenticated.
6. As an Owner, I want to be returned to the page I was trying to reach after signing in, so that a deep link isn't lost.
7. As a signed-in Owner, I want visiting the login page to send me straight to the dashboard, so that I don't have to navigate manually.
8. As the system, I want anonymous sessions (the device auth mechanism) to be treated as *not* a dashboard user, so that a device credential can never load the human UI.

**Tenancy & landing**

9. As an Owner, I want to land on the Room(s) in the Property I'm assigned to, so that I see my data with no setup.
10. As an Owner assigned to exactly one Room, I want to land directly on that Room's live view, so that there's no pointless intermediate list.
11. As an Owner, I want to never see a Property I'm not a member of, so that tenants are isolated from each other.
12. As an Admin, I want to view any Property's Rooms, so that I can support Owners and verify devices.
13. As an Owner with no assigned Property, I want an explanatory empty state ("no property assigned — contact your administrator"), so that a blank screen doesn't look like a failure.
14. As an Owner, I want the Property and Room shown by their names, so that "room_001" isn't the only label I get (falling back to the ID if unnamed).

**Live telemetry**

15. As an Owner, I want to see the Room's current occupancy state (VACANT, OCCUPIED_ACTIVE, etc.), so that I know if someone is in the room right now.
16. As an Owner, I want a plain-language "Occupied / Vacant" summary derived from the occupancy state, so that I don't have to interpret seven raw state names.
17. As an Owner, I want to see current temperature and humidity, so that I can judge comfort.
18. As an Owner, I want to see the gas reading and know the alarm threshold (>300), so that I can see at a glance whether air quality is safe.
19. As an Owner, I want to see power and energy, so that I have a sense of consumption.
20. As an Owner, I want power and energy readings clearly marked *simulated*, so that I'm not misled into treating dummy values as a real meter (per ADR-0003).
21. As an Owner, I want to see water level and flow rate, so that I can monitor the tank and usage.
22. As an Owner, I want to see whether the door is open, and whether motion/human presence is detected, so that I understand the room's activity.
23. As an Owner, I want to see relay and buzzer status, so that I know which loads and the alarm are currently energized.
24. As an Owner, I want the view to update on its own within a few seconds of the device writing, so that what I see reflects reality without me refreshing.
25. As an Owner, I want readings shown with sensible units (°C, %, W, kWh, L/min), so that the numbers are meaningful.
26. As an Owner, I do NOT want the dashboard to re-derive occupancy or invent readings the firmware doesn't send, so that there is one source of truth (the device).

**Freshness / offline honesty**

27. As an Owner, I want to see when the device was last heard from ("last seen 4s ago"), so that I can trust the recency of the data.
28. As an Owner, I want the Room marked **offline** when no update has arrived for more than 15 seconds, so that a frozen last-value doesn't look live forever.
29. As an Owner, I want an offline Room's readings visually de-emphasized (greyed), so that stale numbers are obviously not current.
30. As an Owner, I want freshness judged against the server's clock rather than my possibly-wrong device clock, so that a skewed laptop clock doesn't wrongly flag the room offline.
31. As an Owner, I want the view to recover to "online" automatically when the device resumes writing, so that a brief WiFi blip clears itself.

**Trust & loading states**

32. As an Owner, I want a loading indicator while the first snapshot arrives, so that an empty screen isn't mistaken for "no data".
33. As an Owner, I want a clear message if the Room has never reported (no `latest` yet), so that I can tell "never seen" apart from "went offline".
34. As an Owner, I want the app to stay usable if a single telemetry field is missing or malformed, so that one bad value doesn't blank the whole view.

## Implementation Decisions

**Architecture — ports & adapters (the test seam).** All Firebase access is behind two internal
ports so the UI never imports the Firebase SDK directly:

- **`AuthGateway`** — the authentication concern. Roughly: `signIn(email, password)`,
  `signOut()`, and `observeSession(cb)` yielding a `Session | null`, where a `Session` carries the
  `uid` and the resolved `role` (`"owner" | "admin" | "device"`) read from the Firebase custom-claims
  token. An anonymous Firebase user resolves to **no dashboard session** (device, not human).
- **`RoomDataSource`** — the RTDB read concern. Roughly: `listAccessibleRooms(session)` (returns the
  Property/Room descriptors the session may see, honoring tenancy) and
  `subscribeLatest(propertyId, roomId, cb)` returning an unsubscribe function and yielding typed
  `Telemetry` snapshots, plus a server-time-offset signal for freshness.

The **real adapters** wrap `firebase/auth` and `firebase/database`. **In-memory fakes** implement the
same interfaces for UI/hook tests. Ports are provided to the React tree via context so tests inject
fakes. This is the single UI-facing seam; contract conformance of the real adapter is proven
separately against the Firebase Emulator (see Testing Decisions).

**Firmware contract types.** A TypeScript module encodes the `latest` payload (all fields from
`docs/firmware-contract.md`, exact names and types) and the seven `occupancyState` string literals.
Per ADR-0002 these types are the compile-time guard against field-name drift. Types are read-only and
mirror the contract verbatim; energy fields carry no special type but the UI layer tags them simulated.

**Derived logic — pure functions, no seam needed.** Two pure functions, unit-tested directly:

- `isOccupied(occupancyState)` — membership in `{ENTRY_DETECTED, OCCUPIED_ACTIVE, OCCUPIED_IDLE,
  OCCUPIED_SLEEPING, EXIT_PENDING}`, exactly firmware's `isOccupiedState()` predicate.
- `deviceFreshness(updatedAt, nowMs, thresholdMs = 15000)` — returns online/offline + age. `nowMs`
  is injected (server-offset-corrected) so the function is deterministic and clock-injectable in tests.

**Tenancy enforcement.** `RoomDataSource.listAccessibleRooms` reads the Owner's Property list from
the `users/{uid}/properties` index (ADR-0005), then the Rooms under each Property. An Admin session
bypasses membership and may list any Property. RTDB security rules enforce the same server-side; the
client filter is UX, not the security boundary. **This slice does not build the rules file or the
Admin assignment UI** — see Out of Scope and the seeding note.

**Seeded data for the skeleton.** Because Admin registration and device provisioning are later
slices, this slice runs against **manually seeded** RTDB records: one Property (`property_001`), one
Room (`room_001`) matching the live firmware, one Owner account, and the membership +
`users/{uid}/properties` index pointing that Owner at `property_001`. A short, committed **seed
script** (Admin SDK, run by a human) creates these. The seed script is a dev/bootstrap tool, not the
product, and is documented as such.

**Firebase app init.** A single client-SDK app singleton reads config from `NEXT_PUBLIC_FIREBASE_*`
env vars (`.env.example` already lists them). The dashboard connects to the **same** Firebase project
the firmware writes to (`ecostay-ems` after the ADR-0009 migration) so it reads real device data. No
secrets beyond the public web config live in the client (security is in RTDB rules, per ADR-0003).

**Routing & guard.** Next.js App Router. A client-side auth guard wraps the dashboard route group:
no session → redirect to login (preserving the intended path); anonymous/device session → treated as
no session. The realtime view is client-rendered (RTDB listeners are client SDK, per ADR-0002).

**Rendering the walking skeleton.** The dashboard renders the accessible Room's live telemetry as
labelled readings grouped sensibly (occupancy, climate, safety/gas, power [simulated], water,
activity, relays). shadcn/Tailwind components added one-by-one as needed (ADR-0004) — no bulk import.
Offline state greys the readings and shows the last-seen age; never-reported and first-load states are
distinct from offline.

## Testing Decisions

**What a good test asserts here:** external, observable behavior through the ports — "given the
`RoomDataSource` fake emits this `latest` snapshot, the Owner sees Occupied and a 22°C reading";
"given no emission for 16s of injected time, the Room shows offline and greyed". Tests must not assert
private component internals, exact class names, or Firebase call shapes. Derived pure functions are
tested as functions (input → output), including boundary cases (exactly 15s; each of the seven
occupancy states; reboot/`updatedAt` regressions).

**Modules under test:**

- `isOccupied` and `deviceFreshness` — pure unit tests, all branches and boundaries.
- The dashboard view + hooks — rendered with **in-memory fake ports** (Testing Library + jsdom, the
  existing harness from `page.test.tsx`): login flow, guard redirect, anonymous-session rejection,
  tenancy empty state, live-update re-render, simulated labelling, offline/never-reported/loading
  states, malformed-field resilience.
- The **real Firebase adapters** — a separate integration test suite running against the **Firebase
  Emulator Suite** (Auth + RTDB): sign-in succeeds/fails; a write to
  `properties/property_001/rooms/room_001/latest` surfaces through `subscribeLatest` with the correct
  types; tenancy read returns only the Owner's Properties; an Admin reads across Properties. This is
  the proof that we conform to the firmware contract's paths and field shapes.

**Prior art:** `src/app/page.test.tsx` establishes the Vitest + Testing Library + jsdom + `@/` alias
harness; UI tests follow its render-and-assert-behavior style. The emulator suite is new
infrastructure introduced by this slice (a `test:integration`-style script; the default `npm test`
stays pure-unit and emulator-free so the red-green loop remains fast).

**Discipline:** TDD red → green → refactor; `npm test` + `npm run typecheck` green before every
commit (CLAUDE.md non-negotiables). Auth, security rules, and anything touching the firmware are risk
gates — this slice touches auth (stop-and-confirm on the guard/claims behavior) and deliberately does
**not** write RTDB rules or firmware.

## Out of Scope

- **Device control / commands** — writing `devices/*` booleans (lights, fan, pump, etc.) and the
  "controls disabled while offline" behavior. This is the very next slice; the offline treatment here
  is visual-only.
- **Energy history & charts** — needs the Cloud Functions sampler (ADR-0006); no time-series yet.
- **Cost / tariff / savings** — the tariff engine (ADR-0008), CEB rates, and the savings
  counterfactual are later slices.
- **Alerts** — no alert detection, records, or center in this slice.
- **Automation** — no vacancy-cutoff or any occupancy-triggered relay logic.
- **Admin UI** — account management, Property/Room registration, membership assignment, threshold
  and wattage settings. Seeded manually here; the Admin flows are their own PRD.
- **RTDB security rules authoring & the firmware workstream** (provisioning, per-device credentials,
  real PZEM) — device auth stays anonymous for now; rules are a dedicated risk-gated slice.
- **FCM web push, TOU tariffs, multi-Property switcher UI, i18n** — v1.1 / later.
- **Multi-Room switcher UX** — the query path is tenancy-driven and multi-Room-capable, but a rich
  Room picker is deferred; a single seeded Room lands directly.

## Further Notes

- **Why this slice first:** it exercises the riskiest, most architecture-defining path (real device →
  Firebase → typed client → live UI, behind auth and tenancy) with the least surface area, and yields
  a genuinely demoable screen driven by the actual PCB/ESP32 for the capstone evaluation.
- **Contract fidelity is the point.** `lightLevel` is always 0 (no sensor), `totalLiters` resets on
  reboot, `relayStatus` reflects only the presence relay, and energy is simulated — the UI presents
  these honestly rather than hiding the seams (firmware-contract "Consequences").
- **Freshness threshold** is 15s (five missed 3s cycles) for the *UI* offline mark; the ~90s
  offline *alert* belongs to the later Cloud Functions slice and is out of scope here.
- **Follow-on dependencies recorded in CONTEXT.md:** verify SSCL/VAT on a real bill and re-check CEB
  rates at the Q4 2026 revision (both for the future tariff slice, not this one).
- After this PRD is turned into issues (`/to-issues`), each issue should be a thin vertical increment
  (e.g. "app init + env", "AuthGateway port + Firebase adapter + emulator test", "login page + guard",
  "RoomDataSource port + tenancy read", "live telemetry subscription + typed contract", "telemetry
  view + simulated labels", "freshness derivation + offline treatment", "seed script").
