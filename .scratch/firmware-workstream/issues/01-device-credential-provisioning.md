# 01 - Device credential provisioning

Status: implemented-local
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Extend the existing Admin Console/Admin SDK pattern so an Admin can create or reset a
Firebase Auth account for one registered device/room.

## Scope

- Depends on slice 00 vocabulary alignment being complete.
- Add device-account operations to the existing `AdminOperations` port and `/api/admin/*`
  pattern.
- Create a Firebase Auth user with `role: "device"` plus scoped custom claims:
  `propertyId` and `roomId`.
- Tie the account to an existing registered room. Do not create property/room metadata here;
  room registration already exists.
- Return a credential handoff to the Admin once. Do not store the device password in RTDB.
- Support reset/re-issue for a device account if a device is replaced.

## Risk Gates

- #1 Auth and roles: custom claims and Admin SDK route.
- #5 Secrets: generated device passwords must not be logged, committed, or stored in transcript.
- #6 Remote ops when deployed: Vercel env must have the rotated service-account credential.

## Hardware / Human Need

Codeable now with emulator tests. No physical device required until the credential is loaded
onto ESP32 firmware in later slices.

## Production Safety Prerequisite

Slice 01 may be built and emulator-tested now, but the device-account route must not be used
to create real production device accounts until the leaked Firebase service-account key is
rotated. Treat prod use as blocked by risk gate #5 until the human closes that ops item.

## Test Plan

- Unit-test input validation: existing room required, email/password shape, duplicate handling.
- Unit-test custom claim shape: `role: "device"`, `propertyId`, `roomId`.
- Emulator integration: Admin can create/reset device account; Owner is denied.
- Confirm no password is persisted to RTDB.
- Confirm tests do not require a production service-account key.

## Stop Before

Do not implement until human approves risk gates #1 and #5 for this slice.

## Implementation Result

- Approved for risk gates #1 and #5, then implemented in the existing Admin SDK/Admin UI
  pattern.
- Added `/api/admin/devices` with admin-only create/reset actions.
- Device accounts are Firebase Auth email/password users with `role: "device"`,
  `propertyId`, and `roomId` custom claims.
- Device passwords are generated server-side, returned in the API response, and not written
  to RTDB.
- Production use remains blocked until the Firebase service-account key is rotated.

Verification:

- `npm test`
- `npm run typecheck`
- `npm run test:integration`
- `npm run build`
- Desktop/mobile rendered UI check through temporary local preview route, removed afterward.
