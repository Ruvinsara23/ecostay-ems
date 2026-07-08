# 03 - Admin console: room/device registration

Status: pending-risk-gate-approval
Slice: 3 of 4 · Parent: `.scratch/admin-console/PRD.md`

> Goal: let an Admin register a room from the product instead of running the
> seeder. Keep the UI aligned with the Owner side and the existing Admin settings
> surface: same rail, glass panel, compact controls, and calm save feedback.

## Risk gate approval needed before code

This slice needs explicit approval before implementation:

- **Risk gate #1**: introduces a Next API route backed by the Firebase Admin SDK
  and requires admin-claim verification from a Firebase ID token.
- **Risk gate #2**: writes room metadata under `properties/*`.
- It also writes `ops/roomIndex`, which is Admin-SDK-only internal state used by
  sampler/tick/rollup. This must not be exposed through client RTDB rules.

No firmware edits. No device relay commands. No writes to `devices/*`.

## Proposed server contract

Route:

```text
POST /api/admin/rooms/register
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

Body:

```ts
{
  propertyId: string;
  roomId: string;
  propertyName?: string;
  roomName: string;
}
```

Writes:

```text
ops/roomIndex/{propertyId}/{roomId}: true
properties/{propertyId}/name: propertyName       // only when provided/non-empty
properties/{propertyId}/rooms/{roomId}/name: roomName
```

Validation:

- caller must have custom claim `role === "admin"`;
- `propertyId` and `roomId` are lowercase id slugs (`[a-z0-9_-]`, bounded length);
- `roomName` is non-empty, bounded display text;
- `propertyName`, when present, is bounded display text;
- registration is idempotent for the same room id and updates display names only.

## What to build

- Add a small Admin API route that verifies the Firebase ID token with Admin SDK,
  checks the admin role, validates input, and performs the multi-path update.
- Add an `AdminOperationsGateway` client port so UI code does not import Firebase
  SDK or call `fetch` directly.
- Add an Admin Console "Rooms" section alongside settings, with a room registration
  form for property id, room id, room name, and optional property name.
- After registration, the room should appear in the existing room list because
  `listAccessibleRooms` reads `properties/{pid}/rooms`.
- Preserve honest hardware state: a newly registered room with no device writes
  shows "never reported" until firmware/simulator writes `latest`.

## Explicitly out of scope

- Creating Firebase device credentials or custom claims. That belongs to the
  firmware/device-identity workstream and crosses auth provisioning risk.
- Owner account management. That is slice 04.
- Writing any `devices/*` command defaults.
- Editing `firmware/complete.ino`.

## Acceptance criteria

- [ ] Admin can register a room from `/admin`; owner/non-admin requests are denied.
- [ ] API validates malformed ids/names and returns clear 400/403 failures.
- [ ] Server writes `ops/roomIndex` and room metadata atomically.
- [ ] UI remains visually consistent with the Owner/Admin glass design.
- [ ] New registered room appears in `listAccessibleRooms` for admins.
- [ ] No client RTDB rules are opened for `ops/**`.
- [ ] Unit tests cover validation + server writes.
- [ ] Emulator/integration tests cover admin allowed and owner denied.
- [ ] `npm test`, `npm run test:integration`, `npm run typecheck`,
      `npm run lint`, and `npm run build` are green.
- [ ] Rendered `/admin` is screenshot-checked after adding the registration form.

## Blocked by

Human approval for risk gate #1 and #2:

- a new Admin SDK route for room registration;
- authenticated admin-token verification from the browser request;
- writes to `properties/{pid}/rooms/{rid}/name`;
- writes to `ops/roomIndex/{pid}/{rid}`.
