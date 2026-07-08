# 04 - Admin console: owner account management

Status: DONE (risk gate #1 approved — full scope; shipped this slice)
Slice: 4 of 4 · Parent: `.scratch/admin-console/PRD.md`

> Goal: let an Admin create/disable/reset owner logins from the product instead of
> re-running the seeder. Keep the UI aligned with the Owner side and the existing
> Admin settings/rooms surfaces: same rail, glass panel, calm feedback.

## Risk gate (approved)

- **Risk gate #1**: Admin SDK auth provisioning — `createUser`, `setCustomUserClaims`,
  `updateUser({disabled})`, `generatePasswordResetLink`. Needs the service account in
  the deployment (already present; **rotate the leaked key** — separate human task).
- Writes tenancy records under `properties/*` + `users/*` via the Admin SDK only.

No firmware. No `role: 'admin'` creation (no privilege escalation — role is hardcoded
`owner`). No change-role in this slice. No device credentials.

## Server contract

```text
GET  /api/admin/owners            -> { owners: OwnerSummary[] }
POST /api/admin/owners            (Authorization: Bearer <admin ID token>)
  { action: 'create',        email, password, propertyId }        -> { uid }
  { action: 'setDisabled',   uid, disabled }                      -> {}
  { action: 'resetPassword', email }                              -> { resetLink }
```

`OwnerSummary = { uid, email, disabled, propertyIds: string[] }`

Create writes atomically (mirrors the seeder):

```text
custom claim role: 'owner'
properties/{propertyId}/members/{uid}: 'owner'
users/{uid}/properties/{propertyId}: true
```

## Validation / guards

- caller must have custom claim `role === 'admin'` (else 401/403);
- create: valid email, password length >= 8, `propertyId` slug; **property must already
  exist** (register a room first) else 400; duplicate email -> 400;
- setDisabled / resetPassword: target must be an existing **owner** account (defense in
  depth — the admin console cannot disable/reset another admin);
- reset returns a link for the admin to hand over (no email service configured).

## What to build

- `manage-owner.ts` pure validators; `admin-owners.ts` server ops (Admin Auth + db).
- `GET/POST /api/admin/owners` route reusing `authorizeAdmin`.
- Extend the `AdminOperations` port (+ fake + HTTP adapter).
- Admin Console "Owners" rail view: create form + owner list with disable/enable +
  reset-link actions. Visually consistent with Settings/Rooms.

## Acceptance criteria

- [x] Admin can create an owner + assign to a property; owner/non-admin denied (403).
- [x] Create writes the role claim + both tenancy records atomically; new owner sees
      that property's rooms on next sign-in (`listAccessibleRooms`).
- [x] Disable/enable flips the Firebase account; reset returns a valid link.
- [x] Guards: duplicate email, missing property, non-owner target all return clear 400.
- [x] No client RTDB rules opened for `users/**` or `members` writes (Admin SDK only).
- [x] Unit tests (validators + fake-backed UI) + emulator tests (admin allowed, owner
      denied, create/list/disable/reset) green.
- [x] `npm test` (216), `npm run test:integration` (41), typecheck, lint, build green.
- [x] Rendered `/admin` Owners view screenshot-checked.

## Out of scope

- Change-role (owner<->admin), multi-property assignment in one call, deleting accounts,
  sending the reset email (link is surfaced to the admin), i18n.
