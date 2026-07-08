# PRD: Admin Console

Status: COMPLETE — all four slices (01-04) implemented and shipped
Feature slug: admin-console
Created: 2026-07-07
Phase: 6

> Admin-only screens to manage what the system currently has seeded. The Admin role already
> exists (custom claim, ADR-0005) and sees all properties; today it has no distinct UI. This
> gives it one. Vocabulary: CONTEXT.md "Admin". Guard: admins only — owners must never reach it.

## Problem Statement

Tariff category, circuit wattages, alert thresholds, room/device registration and owner accounts
are all seeded by scripts or hardcoded. An admin can't change them from the product — editing the
tariff (which drives every cost/savings figure) means re-running a seed script by hand.

## Solution

An admin-only console. Slice by slice: (01) edit the property's **tariff category + circuit
wattages**; then alert thresholds; then room/device registration; then **owner-account management**
(create/disable/reset — risk gate #1, Admin SDK). Reached from the rail's Settings icon (which
becomes functional for admins). Owners hitting an admin route are redirected.

## Slices

1. **Settings: tariff + wattages** (DONE) — admin-only route, edit `settings/tariffCategory`
   (D-1/GP-1/H-1) and `settings/circuitWattages` {lights, exhaustFan}. Rules: admin-write these
   fields (risk gate #2). No Admin SDK.
2. **Alert thresholds** (DONE) — edit temperature/water-level thresholds; tick reads them instead of constants.
3. Room/device registration (DONE) — Admin-SDK route `POST /api/admin/rooms/register` writes
   `ops/roomIndex` + property/room names; Rooms view in the rail. No firmware, no device creds.
4. **Owner accounts** (DONE) — create/disable/reset + assign-to-property via Admin SDK behind
   `GET/POST /api/admin/owners` (**risk gate #1**, approved). Owners rail view. Role hardcoded
   `owner` (no privilege escalation); non-owner targets refused. Needs the service account in the
   deployment (already present — rotate the leaked key).

## Implementation Decisions

- **Guard**: reuse `RequireSession`; add an admin-role assertion (redirect non-admins to `/`).
- **Port**: `RoomDataSource` gains `setTariffCategory`, `subscribeCircuitWattages`,
  `setCircuitWattages`. UI still imports the port only.
- **Rules** (risk gate #2, present diff): admin (role claim) may write
  `properties/{pid}/settings/tariffCategory` (validate ∈ D-1/GP-1/H-1) and
  `properties/{pid}/settings/circuitWattages` (validate numeric lights + exhaustFan). Owners cannot.
- **No new deps.** Bespoke form; a shadcn Select may be vendored if it earns its keep.

## Testing Decisions

Same seam discipline: UI tested against the fake `RoomDataSource`; emulator proves an admin's
settings write is allowed and an owner's is denied. Guard tested (owner redirected). Prior art:
`require-session.test.tsx`, the tenancy/alert-ack emulator tests.

## Out of Scope (this slice)

Account creation (slice 04, risk gate #1), thresholds (slice 02), registration (slice 03),
multi-property switching UX, i18n.
