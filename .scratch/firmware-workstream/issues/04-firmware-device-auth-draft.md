# 04 - Firmware device auth draft

Status: pending-human-approval
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Replace anonymous Firebase sign-up with email/password sign-in for a pre-created device
account, without changing RTDB paths or telemetry shape.

## Scope

- Remove `Firebase.signUp(&config, &auth, "", "")` from the normal device path.
- Use the device email/password created in slice 01.
- Preserve all existing RTDB writes/reads after auth succeeds.
- Keep anonymous auth available in Firebase until cutover so the bench bridge is not broken.
- Ensure failed auth leaves telemetry offline rather than writing to any fallback path.

## Risk Gates

- #7 Firmware.
- #1 Auth and roles: depends on device custom claims from slice 01.
- #5 Secrets: firmware credentials must not be committed, printed into transcripts, or logged.

## Hardware / Human Need

Firmware draft can be written now after approval. A real compile check is only claimable if
`arduino-cli`, the ESP32 core, and the existing sketch libraries are installed/configured.
If not, record compile as "not run" and do static review only. Real success needs a
provisioned device account, credential entry on the ESP32, and a human reflash.

## Test Plan

- Static review that Firebase initialization still preserves the existing RTDB writes/reads.
- Arduino compile only when the local toolchain is actually available; otherwise explicitly
  report "not run".
- Bench serial verification: device signs in with email/password and reports auth failures clearly.
- RTDB smoke test: device writes `latest` only under its configured room.
- Dashboard smoke test: device shows live after writes resume.

## Stop Before

Do not edit firmware auth code or handle real credentials until human approves risk gates
#1, #5, and #7 for this slice.
