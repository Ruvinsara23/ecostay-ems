# Owner dashboard v2 — slice 01: property→room Home + device-control tiles

**Why (owner-reported):** the owner shell was flat and room-centric. "Home" just
cleared the selection and dumped you at a plain "Choose a room" button list with
**no status** — an owner with several properties × rooms couldn't see what needed
attention. And the device controls were undifferentiated toggle rows crammed over
the 3D scene. Two forks were confirmed with the user (property overview with room
status cards; icon-tile device controls).

**What shipped:**

- `src/rooms/owner-home.tsx` — the new Home landing: a fleet stat strip
  (properties / rooms / rooms reporting / open alerts) + each property as a
  section with a grid of room cards. Each card shows a live status dot (same 15 s
  freshness as the room view), occupancy or offline age, temp/power, and an
  open-alert badge. Click a card → opens that room's Live View. Built entirely
  from existing client ports (`listAccessibleRooms` + per-room `subscribeLatest`
  + per-property `subscribeAlerts`) — no backend change.
- `src/app/page.tsx` — reworked the tab model: `Home` is now a real overview
  (not an alias for the picker). Room selection lifted to the shell; opening a
  room sets the pick + Live View; the shell tracks whether the overview vs a room
  is showing so the header title (`My Properties` vs `Live 3D Room View`/tab) is
  truthful. Deep links (`?pid&rid`, `?tab`) and the admin bounce are preserved.
  Single-room owners still land straight on their room.
- `src/rooms/room-live-view.tsx` — `DeviceControls` rebuilt as an icon-tile grid
  (Lights/Exhaust fan/Water pump/Presence relay): per-device icon, big tap
  target, clear On/Off state pill, optimistic "Saving…" that follows the
  subscription echo, and the existing risk-gate #3 semantics kept verbatim
  (commanded state only, disabled offline, "Actual: On" for presence, "Forced on"
  during gas, failure reverts). Vacancy automation stays its own switch below.

**Risk gates:** none newly crossed — device control still writes only the four
approved `devices/*` leaves under the gate-#3 rules; no auth/rules/money changes.

**Verified:** 328 unit tests green, typecheck + lint clean, desktop + 390 px
mobile screenshot-verified (overview, room live view with tiles).
