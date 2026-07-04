# 05 — UI design pass (dashboard visual quality)

Status: needs-triage (stub — to be specified after slices 01–04 land)
Slice: follow-up to the walking skeleton

## Parent

`.scratch/owner-live-room-view/PRD.md` — extends the walking skeleton with the visual quality
pass the PRD deliberately deferred.

## What to build (to be refined)

The four skeleton slices ship functional-but-plain Tailwind. This slice makes the dashboard
look like a product, working against the complete skeleton:

- App shell: header/nav, property+room context, sign-out placement, consistent page framing.
- shadcn/ui adoption where it earns its keep (cards, badges, alert, skeleton loaders) —
  vendored one-by-one per ADR-0004, never a bulk dump.
- Visual hierarchy for the telemetry groups (occupancy as the hero, alarm states prominent,
  simulated badge styling), loading skeletons instead of text-only states.
- Responsive audit (phone-width owner usage is the norm) and dark-mode consistency.
- Empty/error states styled (never-reported, no-property, offline once slice 04 lands).

Keep all behavior under the existing tests — this slice must not change what the view *says*,
only how it looks. Test suite stays green untouched except where accessible roles/labels improve.

## Acceptance criteria (draft)

- [ ] All existing unit tests pass without weakening assertions.
- [ ] Dashboard is usable at 360 px width; dark mode has no unreadable elements.
- [ ] Occupancy, gas alarm, and simulated labeling are visually prominent.
- [ ] No bulk component imports; each shadcn component vendored deliberately.

## Blocked by

- Slices 01–04 (design against the complete skeleton).
