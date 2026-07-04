# ADR-0005: Auth & tenancy — custom claims via Admin SDK behind Next API routes

Date: 2026-07-04 · Status: Accepted (Phase 1 grilling)

## Context
The dashboard needs two human roles (Owner, Admin) with per-property tenancy, plus a
machine identity per device. Client-side role checks are trivially bypassed; the previous
build had superadmin pages guarded only in React. RTDB rules can only trust what's in
`auth.token` or in the database itself.

## Decision
- Roles live in **Firebase custom claims**: `role: admin | owner | device`, set exclusively
  by the **Firebase Admin SDK inside Next API routes** (the repo's only server surface
  besides Cloud Functions). First admin is bootstrapped by a one-off seed script.
- **Tenancy authority**: `properties/{pid}/members/{uid}: "owner"` — the record RTDB rules
  check. A mirrored index `users/{uid}/properties/{pid}: true` gives owners a one-read
  property list. Both written atomically by the Admin API route. Admins bypass membership
  via role claim.
- **Device identity**: per-device email/password accounts with `role=device` claims scoped
  1:1 to a room, created when Admin registers the room. Anonymous sign-in is disabled
  project-wide at firmware cutover (ADR-0007); until then a transitional ruleset tolerates
  anonymous writes to `property_001/room_001` only, and is deleted at cutover.

## Consequences
- Account management (create/disable/reset/role) is Admin-UI + API-route work, never client SDK.
- Rules must be written against claims + members records; every rules change is a risk gate.
- A service-account key exists for the Admin SDK — handled under the secrets risk gate.
