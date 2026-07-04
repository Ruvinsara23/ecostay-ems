# 04 — Freshness & offline honesty

Status: ready-for-agent
Slice: 4 of 4
Covers user stories: 27–31

## Parent

`.scratch/owner-live-room-view/PRD.md` — Owner live room view (walking skeleton).

## What to build

Make the live view honest about staleness: a frozen last-value must not look live forever.

End-to-end behavior:

- The Room is marked **offline** when no update has arrived for more than **15 seconds** (five missed
  3-second write cycles).
- While offline, the readings are visually **de-emphasized (greyed)** and a **"last seen Ns ago"**
  indicator is shown, so stale numbers are obviously not current.
- Freshness is judged against the **server's clock**, not the viewer's device clock, so a skewed
  laptop clock does not wrongly flag the Room offline (use the RTDB server-time offset).
- **Offline is distinct from never-reported** (the empty state from Slice 2) — a Room that has never
  sent a `latest` is not the same as one that went quiet.
- The view **recovers to online automatically** when the device resumes writing (a brief WiFi blip
  clears itself).

New machinery:

- **`deviceFreshness(updatedAt, nowMs, thresholdMs = 15000)`** pure function returning online/offline
  plus the age; `nowMs` is injected (server-offset-corrected) so it is deterministic and
  clock-injectable in tests. Unit-tested at the boundary (exactly 15s) and across `updatedAt`
  regressions (e.g. device reboot).
- A **server-time-offset** signal from `RoomDataSource` (RTDB `.info/serverTimeOffset`) feeding the
  corrected `nowMs`.

Note: this slice covers the **UI** offline mark only. The ~90-second offline **alert** belongs to the
later Cloud Functions slice (ADR-0006) and is out of scope here. Device controls and their
"disabled while offline" behavior are also out of scope (this view is read-only).

## Acceptance criteria

- [ ] After >15s with no new `latest`, the Room shows offline with readings greyed and a "last seen Ns ago" indicator.
- [ ] Within-15s updates keep the Room online; the offline mark clears automatically when writes resume.
- [ ] Freshness is computed against a server-offset-corrected clock, not the raw local clock (a wrong local clock does not flip the state).
- [ ] The offline state is visually and semantically distinct from the never-reported empty state.
- [ ] `deviceFreshness` is unit-tested at the 15s boundary and for `updatedAt` regressions, with an injected clock.
- [ ] `npm test` and `npm run typecheck` are green.

## Blocked by

- `.scratch/owner-live-room-view/issues/02-live-telemetry-seeded-room.md`

## Comments

**2026-07-04 (agent) — field evidence from the Stage A hardware smoke test.**

- After the ESP32 stopped writing (12:34:31Z), the dashboard kept showing its last snapshot
  (EXIT_PENDING, sine-wave power) as if live — the exact failure this slice exists to fix,
  now reproduced on real hardware.
- **Real clock skew measured on the dev machine: ~25 minutes** (a naive `Date.now() − updatedAt`
  computed −1528 s staleness). The server-offset-corrected clock (`.info/serverTimeOffset`)
  is load-bearing, not defensive theory. Test the skewed-clock case explicitly.
