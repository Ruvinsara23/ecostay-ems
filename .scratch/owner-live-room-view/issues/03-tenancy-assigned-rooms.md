# 03 — Tenancy: Owner sees only assigned Rooms; Admin sees all

Status: ready-for-agent
Slice: 3 of 4
Covers user stories: 9, 11–14

## Parent

`.scratch/owner-live-room-view/PRD.md` — Owner live room view (walking skeleton).

## What to build

Make Room selection tenancy-driven instead of hardcoded, enforcing that an Owner only ever sees
Properties they belong to while an Admin sees any Property.

End-to-end behavior:

- On landing, the dashboard determines which Room(s) the session may see from the Owner's membership
  rather than a fixed ID. An Owner assigned to exactly one Room lands directly on that Room's live
  view (the same view built in Slice 2, now reached through tenancy).
- An Owner **never** sees a Property they are not a member of.
- An **Admin** session may view any Property's Rooms (bypasses membership via the role claim).
- Property and Room are shown by their **names**, falling back to the ID when unnamed (so
  "room_001" is never the only label).
- An Owner with **no assigned Property** gets an explanatory empty state ("no property assigned —
  contact your administrator"), not a blank screen.

New machinery:

- **`RoomDataSource.listAccessibleRooms(session)`** — reads the Owner's Property list from the
  `users/{uid}/properties` index (ADR-0005), then the Rooms and their name metadata under each
  Property; an Admin session returns Rooms across all Properties. Real `firebase/database` adapter +
  in-memory fake, same seam pattern as Slice 2.
- The client-side membership filter is **UX, not the security boundary** — server-side RTDB rules
  (a later, separately gated slice) are the real enforcement; do not author rules here.

## Acceptance criteria

- [ ] An Owner lands on the Room(s) from their membership with no hardcoded Property/Room ID in the view path.
- [ ] An Owner assigned to one Room lands directly on it; an Owner with none sees the "no property assigned" empty state.
- [ ] An Owner cannot load a Property they are not a member of (verified through the port at the client level).
- [ ] An Admin session can view Rooms across more than one Property.
- [ ] Property and Room render by name, falling back to the ID when the name is absent.
- [ ] `listAccessibleRooms` has an in-memory fake and a real adapter; an emulator test shows an Owner sees only their Property and an Admin reads across Properties.
- [ ] `npm test` and `npm run typecheck` are green.

## Blocked by

- `.scratch/owner-live-room-view/issues/02-live-telemetry-seeded-room.md`
