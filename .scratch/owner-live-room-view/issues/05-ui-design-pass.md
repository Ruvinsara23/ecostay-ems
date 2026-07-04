# 05 — UI design pass (dashboard visual quality)

Status: needs-triage (spec drafted 2026-07-04; awaiting human approval of the mockup direction)
Slice: follow-up to the walking skeleton
Mockup: https://claude.ai/code/artifact/e3c44037-5b97-4357-aa80-9d680c28a7be (interactive — preview Occupied / Sleeping / Vacant / Gas alarm / Offline)

## Parent

`.scratch/owner-live-room-view/PRD.md` — extends the walking skeleton with the visual quality
pass the PRD deliberately deferred.

## Design direction (from the user's reference, 2026-07-04)

**Style: "soft smart-home SaaS"** — pastel periwinkle canvas, floating white cards with large
radii (16–24 px) and soft layered shadows, one indigo accent, icon-rail navigation, an isometric
glass-walled room as the centerpiece, generous whitespace, pill-shaped controls.

### Tokens (mockup-validated; port into Tailwind theme)

| Token | Light | Dark |
|---|---|---|
| canvas | #DCDEF2 | #15162A |
| card / card-2 | #FFFFFF / #F6F7FE | #1E2038 / #24264A |
| ink / ink-2 / ink-3 | #191A2E / #6E7191 / #9BA0BF | #ECEEFC / #A2A7CD / #6E739C |
| accent / accent-soft | #4F5BE7 / #EEF0FE | #7C86FF / #272B58 |
| live (status) | #1F9D66 | #34C98B |
| warn = Simulated badge | #B45309 | #E8A23D |
| alarm/offline | #D92D20 | #FF6A5E |

Status colors are reserved for state (live/simulated/alarm) — never decoration. Typography:
Geist (already shipped), tabular numerals on all readings. Dark theme is a deliberate
derivation, not an inversion; both themes shipped.

### Layout mapping (reference → EcoStay)

- **Icon rail** (left): logo, Live view (active), Rooms + Alerts as visibly-disabled future
  stubs (tooltip "coming soon"), sign-out at bottom. No dead navigation beyond those two stubs.
- **Header**: "Live Room View", property · room crumb, **freshness pill** ("Live · 3s ago" /
  red "Offline — last seen …"), sign out + avatar.
- **Centerpiece: 2.5D isometric SVG room** (decision below): glassy walls, bed, door that
  swings with `doorOpen`, occupancy floor-glow tied to `humanPresent`, device markers
  (door reed, PIR, DHT, gas, water) that highlight with their live state; greys/desaturates
  when offline; gas-alarm banner overlays the room.
- **Floating mini-cards** under the room: Activity (door/motion/presence chips), Relays
  (presence relay, light level honestly "No sensor").
- **Right column cards**: Occupancy hero (plain-language summary + raw state), Climate
  (radial temp dial + humidity), Energy (**Simulated** amber badge, power hero number,
  energy/voltage/current grid, cost placeholder "needs tariff"), Air & Safety (gas meter with
  a visible 300 threshold tick, alarm badge, buzzer chip), Water (tank fill, flow, since-boot).

### 3D decision

Real WebGL 3D (three.js/react-three-fiber) is possible but heavy for the capstone critical
path. **v1 ships the 2.5D isometric SVG room** (as mocked) — it reads as 3D, reacts to live
telemetry, costs no bundle weight, and stays testable. A true-3D upgrade is a separate,
optional later issue if schedule allows.

## What to build

Implement the approved mockup direction in the Next app, keeping all behavior under the
existing tests:

1. Tailwind theme tokens + app shell (canvas, rail, header) — `RequireSession`/auth flows
   untouched.
2. Restyle `RoomLiveView` into the card system (Occupancy hero, Climate dial, Energy,
   Safety meter, Water tank, Activity/Relays chips). Same displayed strings and semantics —
   tests keep passing with at most selector/a11y improvements.
3. Isometric room SVG component driven by the same `RoomLatest` props (door, presence glow,
   marker states, offline desaturation).
4. Login page restyled to match.
5. Responsive: usable at 360 px (rail collapses to a top bar, columns stack); dark mode via
   the token table.
6. shadcn/ui only where it earns its keep (e.g. tooltip, dialog later) — vendored
   one-by-one per ADR-0004; the card system above is bespoke Tailwind.

## Acceptance criteria

- [ ] All existing unit tests pass without weakening assertions (string/behavior parity).
- [ ] Both themes match the token table; no unreadable elements in either.
- [ ] Usable at 360 px width; no horizontal body scroll at any width.
- [ ] Occupancy, gas alarm, offline state, and the Simulated badge are visually prominent
      (state encoded in form + color, never color alone).
- [ ] Isometric room reflects doorOpen / humanPresent / gas alarm / offline from live data.
- [ ] No bulk component imports; each shadcn component vendored deliberately.
- [ ] `npm test`, typecheck, lint, build green.

## Blocked by

- Human approval of the mockup direction (this file's Mockup link).

## Comments

**2026-07-04 (agent)** — Spec drafted from the user's reference screenshot; interactive mockup
published (link above) with the real firmware vocabulary and all five preview states. Awaiting
approval or tweak notes before implementation.
