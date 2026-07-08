# 06 - Cutover and contract version

Status: pending-human-approval
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Perform the human-controlled cutover from anonymous bench access to provisioned device
credentials after firmware and rules are proven on hardware.

## Scope

Cutover checklist:

- Rotate the leaked Firebase service-account key before relying on Admin SDK provisioning in prod.
- Create/provision the device account for the bench room.
- Flash the ESP32 with configured property/room IDs and device credentials.
- Verify writes to `properties/{propertyId}/rooms/{roomId}/latest` in `ecostay-ems`.
- Publish device-scoped RTDB rules.
- Disable Anonymous auth in Firebase.
- Delete the transitional anonymous `property_001/room_001` rules.
- Update `docs/firmware-contract.md` identity section with the new auth/provisioning note.

## Risk Gates

- #1 Auth and roles: custom claims and Anonymous auth disablement.
- #2 RTDB security rules: final rules publish and anonymous bridge deletion.
- #5 Secrets: service-account rotation and device credentials.
- #6 Remote ops: Firebase console/provider/rules changes.
- #7 Firmware: physical flash.
- #8 Money-facing math: real PZEM changes the trust level of cost/savings values.

## Hardware / Human Need

Human/ops-only plus bench hardware. This is not an unattended agent step.

## Test Plan

- Before deletion: device account writes own `latest`; dashboard marks room live.
- After anonymous disablement: old anonymous path cannot write.
- After rules publish: emulator-equivalent checks are matched by live smoke tests.
- Dashboard: energy values are still typed correctly and no path/field changed.
- Docs: firmware contract identity section updated; shape section unchanged.

## Stop Before

Do not disable Anonymous auth, publish final rules, delete transitional rules, or edit live
Firebase settings without explicit human approval at cutover time.
