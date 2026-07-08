# PRD: ADR-0007 Firmware Workstream

Status: slice-01-implemented-local
Feature slug: firmware-workstream
Created: 2026-07-08
Parent decision: `docs/adr/0007-firmware-workstream.md`

## Problem Statement

The current ESP32 firmware is contract-compatible with the dashboard, but three accepted
gaps remain:

1. The node still hardcodes `property_001` and `room_001`, so every physical device reports
   as the bench room.
2. The node signs in anonymously, so RTDB rules cannot distinguish a real device from any
   other anonymous client.
3. The PZEM fields are simulated, so energy, cost, and savings remain demonstrative until
   real PZEM-004T readings land.

## Contract Boundary

The RTDB contract shape is immutable. This workstream may change identity and data
authenticity only. It must not change:

- path layout: `properties/{propertyId}/rooms/{roomId}/latest`;
- telemetry field names or field types;
- latest write cadence: every 3 seconds;
- command polling cadence: every 500 ms;
- command leaf shape under `devices/*`.

Specific grounding from `docs/firmware-contract.md`: firmware writes `{base}/latest` every
3 seconds, and commands are plain boolean leaves read every 500 ms.

## Current Verified State

- `firmware/complete.ino` contains `String propertyId = "property_001"` and
  `String roomId = "room_001"`, and also has `#define PROPERTY_ID` / `#define ROOM_ID`.
  Runtime `basePath` is built from the `String` values.
- `firmware/complete.ino` already carries the `ecostay-ems` API key/database URL in the repo,
  but the physical node may still need a human reflash.
- `Firebase.signUp(&config, &auth, "", "")` is still used for anonymous device auth.
- `updatePzemDummyReading()` still generates voltage/current/power/energy from a sine wave.
- Admin Console room and owner provisioning already exists:
  `src/admin/admin-rooms.tsx`, `src/admin/admin-owners.tsx`,
  `/api/admin/rooms/register`, `/api/admin/owners`, `src/server/admin-token.ts`,
  and `src/admin/admin-operations.ts`.
- `database.rules.json` is still the canonical RTDB rules copy and still includes the
  transitional anonymous rule for the bench room.

## Scope

Exactly the ADR-0007 workstream:

1. Provisioning: configurable property/room IDs per device.
2. Per-device credentials: email/password device identity with a `role: "device"` custom claim
   scoped to one property/room.
3. Real PZEM-004T reads replacing simulated PZEM values.

## Out of Scope

- Changing RTDB path layout or telemetry shape.
- Changing command semantics or touching `devices/mainRelay` behavior.
- Creating a new dashboard data layer.
- Changing Owner/Admin tenancy beyond the device-credential extension.
- Disabling anonymous auth before a bench device has successfully proven device credentials.
- Removing simulated labels from UI before real PZEM is hardware-verified.
- Editing `firmware/complete.ino` outside an approved issue slice.

## Workstream Slices

0. `issues/00-context-vocabulary-alignment.md`
1. `issues/01-device-credential-provisioning.md`
2. `issues/02-device-scoped-rules-draft.md`
3. `issues/03-firmware-provisioning-config-draft.md`
4. `issues/04-firmware-device-auth-draft.md`
5. `issues/05-real-pzem-readings-draft.md`
6. `issues/06-cutover-and-contract-version.md`

## Codeable Now vs Hardware/Human Work

Codeable now:

- CONTEXT vocabulary alignment for Device account, Device credential, and Provisioning.
- Admin SDK route and Admin Console extension to create/reset a device account for a registered room.
- Draft device-scoped RTDB rules and emulator tests.
- Firmware code draft for loading configurable property/room/device credentials while preserving paths.
- Firmware code draft for email/password sign-in.

Needs hardware/human bench work:

- Provisioning real credentials into a physical ESP32.
- Flashing the device.
- Wiring and validating PZEM-004T on the PCB/bench.
- Publishing final RTDB rules.
- Disabling Anonymous auth in Firebase.
- Removing transitional anonymous rules only after device-credential writes are verified.

## Open Design Decisions Before Firmware Slices

- Slice 03: choose the firmware provisioning source before implementation
  (NVS/Preferences, captive portal, compile-time constants, or another explicit option).
- Slice 05: choose the PZEM Arduino library and confirm the target UART pins/wiring before
  implementation.

## Risk Gates

- #1 Auth and roles: device account creation, custom claims, Admin SDK routes, token handling.
- #2 RTDB security rules: device-scoped rules and transitional anonymous rules deletion.
- #5 Secrets: device passwords and service-account credentials must never be logged or committed.
- #6 Deploys/remote ops: publishing rules and changing Firebase Auth provider settings are human-run.
- #7 Firmware: every firmware edit is inside an approved issue slice only.

## Test Strategy

- Dashboard/Admin SDK work: unit tests for validation and fake ports; emulator integration for
  Admin allowed / Owner denied / device account claims.
- Rules draft: emulator tests for device writes to own `latest`, own water `history`, and own
  command reads; deny cross-room/cross-property access and all `devices/*` writes.
- Firmware draft: run a real Arduino compile only if `arduino-cli`, the ESP32 core, and
  required Firebase/DHT/PZEM libraries are installed and configured. If the toolchain is not
  present, record "not run" and do static review only; never report a compile as green unless
  it actually ran. Hardware serial verification is still required before claiming firmware
  success. Any PZEM failure must keep field types stable and avoid NaN writes.
- Cutover: bench smoke test that the device writes `latest` to the expected room in
  `ecostay-ems`, reads command booleans, and dashboard marks it live.

## Stop Point

This PRD and its issue list are planning deliverables only. Do not implement firmware,
rules, auth, or Admin SDK changes until the human approves the selected slice.

## Recommended Entry Point

Start with slice 01, Device credential provisioning. It is codeable now without physical
hardware and unlocks the rules draft and firmware auth draft, but it still needs explicit
approval for risk gates #1 and #5 before implementation.
