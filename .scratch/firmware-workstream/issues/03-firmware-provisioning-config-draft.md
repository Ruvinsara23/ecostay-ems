# 03 - Firmware provisioning config draft

Status: pending-human-approval
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Replace duplicated hardcoded room identity in `firmware/complete.ino` with configurable
per-device `propertyId` and `roomId`, while preserving the exact RTDB path shape.

## Scope

- Remove or stop using the duplicated `PROPERTY_ID` / `ROOM_ID` macros.
- Keep runtime `basePath = "properties/" + propertyId + "/rooms/" + roomId`.
- Load `propertyId` and `roomId` from the human-approved device-local provisioning source,
  with safe fallback for the bench node until provisioned.
- Keep `FIREBASE_INTERVAL = 3000` and `COMMAND_INTERVAL = 500`.
- Keep all telemetry field names and command paths unchanged.

## Open Design Decision

Human must choose the provisioning source before implementation:

- NVS/Preferences;
- captive portal;
- compile-time constants;
- another explicit option.

## Risk Gates

- #7 Firmware.
- #5 Secrets if the chosen provisioning source also carries credentials in a later slice.

## Hardware / Human Need

Firmware draft can be written now after approval. A real compile check is only claimable if
`arduino-cli`, the ESP32 core, and the existing sketch libraries are installed/configured.
If not, record compile as "not run" and do static review only. Real validation needs a human
to flash a device and confirm it writes to the configured room path.

## Test Plan

- Static review that path shape and cadence are unchanged.
- Arduino compile only when the local toolchain is actually available; otherwise explicitly
  report "not run".
- Static check that `latest`, `history`, and `devices/*` path suffixes are unchanged.
- Bench serial verification: configured IDs appear in the computed base path.
- Dashboard verification: registered room receives `latest`; unconfigured room does not.

## Stop Before

Do not edit `firmware/complete.ino` until human approves risk gate #7 for this slice.
