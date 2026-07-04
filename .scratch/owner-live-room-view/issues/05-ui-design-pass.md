# 05 — UI design pass (dashboard visual quality)

Status: needs-triage (spec drafted 2026-07-04; awaiting human approval of the mockup direction)
Slice: follow-up to the walking skeleton
Mockup: https://claude.ai/code/artifact/e3c44037-5b97-4357-aa80-9d680c28a7be (interactive — preview Occupied / Sleeping / Vacant / Gas alarm / Offline)

## Parent

`.scratch/owner-live-room-view/PRD.md` — extends the walking skeleton with the visual quality
pass the PRD deliberately deferred.

## Design direction (REVISED 2026-07-04 — RentAI branding, light-only)

The first (lavender/indigo) direction was rejected by the user ("need light version…
color matching not professional"). New authority: the **RentAI dashboard branding**
(Behance 212040371, boards reviewed 2026-07-04) — follow it exactly.

**Style: monochrome minimalism + one emerald accent.** Neutral warm-grey canvas, white
floating cards (radius 14–20 px) with hairline-soft shadows, near-black ink, and a single
brand green used sparingly (primary action, live/active states, data fills). Greyscale
everything else. Green doubles as the "Eco" in EcoStay. **Light theme only — deliberate
single-theme commitment; dark mode is out of scope for this pass.**

### Tokens (mockup-validated; port into Tailwind theme)

| Token | Value | Use |
|---|---|---|
| canvas | #E7E8E6 | page background |
| card / card-2 | #FFFFFF / #F1F2F0 | cards / inset wells & tracks |
| ink / ink-2 / ink-3 | #1B1C1C / #6D716F / #A3A7A4 | text hierarchy |
| line | #E2E3E1 | hairlines, marker rings |
| green / green-deep / green-soft | #12A15E / #0E8A4F / #E3F3EA | THE accent: actions, live, active chips, data fills |
| warn / warn-soft | #B45309 / #F8EFE1 | Simulated badge only |
| alarm / alarm-soft | #D6453D / #FBEAE8 | gas alarm, offline |

Status colors (warn/alarm) are reserved for state — never decoration. Typography: Geist
(already shipped) approximating the reference's geometric sans; **display style mixes
weights** (light 300 + bold 700 in one heading, e.g. "Room 1 **· EcoStay Property**");
tabular numerals on all readings.

### RentAI signature elements (adopted)

- **"/Label" slash eyebrows** for section labels (e.g. `/Live view`, `/Activity`).
- **Dotted progress rows** (10 circles, green-filled) — used for tank level.
- **Letter-chip device markers** on the room (D/M/T/G/W in white circles), like the
  reference's L·R·F·B chips.
- **Segmented pill switcher** (grey track, active = white pill).
- Rail: white card, active item = near-black filled circle (matches the black logo usage).

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
5. Responsive: usable at 360 px (rail collapses to a top bar, columns stack). Light-only;
   remove existing `dark:` variants rather than maintaining a second theme.
6. shadcn/ui only where it earns its keep (e.g. tooltip, dialog later) — vendored
   one-by-one per ADR-0004; the card system above is bespoke Tailwind.

## Acceptance criteria

- [ ] All existing unit tests pass without weakening assertions (string/behavior parity).
- [ ] Light theme matches the token table exactly; no stray `dark:` remnants.
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

**2026-07-04 (agent) — direction revised.** User rejected the lavender direction and pinned
the RentAI Behance branding as the authority, light-only. Behance boards downloaded and
reviewed; tokens/signatures extracted (tables above); mockup rebuilt and republished at the
same URL. Awaiting approval of the rebranded mockup.
