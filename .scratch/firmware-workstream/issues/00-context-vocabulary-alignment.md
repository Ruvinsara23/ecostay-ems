# 00 - Context vocabulary alignment

Status: complete
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Make the firmware-workstream vocabulary explicit in `CONTEXT.md` before any slice 01 code
uses those terms. This protects the project rule that code may use only existing,
derived, or accepted terms.

## Scope

Confirm or add accepted terms for:

- Device account;
- Device credential;
- Provisioning.

The definitions must match ADR-0007 and ADR-0005:

- a Device account is a Firebase Auth email/password account for exactly one Device/Node;
- a Device credential is the email/password loaded onto that physical Device/Node;
- Provisioning assigns `propertyId`, `roomId`, and Device credential without changing the
  RTDB contract shape.

## Risk Gates

None for the vocabulary doc update itself. It is a prerequisite to later risk-gated auth,
rules, and firmware work.

## Hardware / Human Need

Code/docs-only. No physical hardware needed.

## Test Plan

- Manual review that `CONTEXT.md` contains only accepted/derived/existing terms.
- During slice 01 review, reject any new code identifier that uses a firmware-workstream
  term not present in `CONTEXT.md`.

## Verification

- `CONTEXT.md` now lists Device account, Device credential, and Provisioning as accepted
  firmware-workstream vocabulary.

## Stop Before

Do not begin slice 01 code until this vocabulary step is complete and reviewed.
