# 02 - Device-scoped RTDB rules draft

Status: pending-human-approval
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Draft and emulator-test RTDB rules that allow a `role: "device"` account to access only
the room it is scoped to, while preserving the current anonymous bench-room bridge until
cutover.

## Scope

Add rules for device claims:

```text
auth.token.role === "device"
auth.token.propertyId === $propertyId
auth.token.roomId === $roomId
```

Allowed:

- write `properties/{propertyId}/rooms/{roomId}/latest`;
- create new `properties/{propertyId}/history/{pushId}` entries whose `roomId` matches the
  device claim;
- read `properties/{propertyId}/rooms/{roomId}/devices` commands.

Denied:

- cross-property or cross-room access;
- overwriting or deleting an existing sibling history entry, even when its `roomId` matches
  the device claim;
- creating a history entry whose `roomId` is absent or different from `auth.token.roomId`;
- device writes to `devices/*`;
- device reads of other property data;
- any device access without matching `propertyId` and `roomId` claims.

Rules-maintenance constraint:

- Preserve existing `.indexOn` declarations while editing `database.rules.json`, including
  the dashboard query index for `sampledAt`. A device-rules draft must not regress owner
  dashboard queries.

## Risk Gates

- #2 RTDB security rules.
- #3 Device commands: rules must not create new command write paths.

## Hardware / Human Need

Codeable now as a draft with emulator tests. Human publishes rules later. Anonymous access
is not deleted in this slice.

## Test Plan

- Emulator: matching device can write own `latest`.
- Emulator: matching device can push own `history` with matching `roomId`.
- Emulator: matching device cannot overwrite or delete an existing `history/{pushId}` entry.
- Emulator: matching device cannot create a history entry for another `roomId`.
- Emulator: matching device can read own commands.
- Emulator: device cannot write commands, cannot read another room, cannot write another room.
- Regression: existing `.indexOn` declarations remain present after the rules edit.
- Regression: anonymous bench-room bridge still behaves as before until cutover.

## Stop Before

Do not edit `database.rules.json` until human approves risk gate #2 for this slice.
