# ADR-0001: Rebuild the dashboard from scratch; keep only the firmware

Date: 2026-07-04 · Status: Accepted

## Context
The previous build (`green-home-hub`, Lovable-generated Vite/React scaffold) had architectural
problems: duplicated business rules across firmware and client, a phantom REST API layer,
simulated data mixed silently with live data, committed `.env`, and no tests or typecheck at all.
The hardware integration, however, works.

## Decision
Abandon the old repository entirely. The **only** kept artifact is `firmware/complete.ino`,
which is treated as a fixed hardware contract (see `docs/firmware-contract.md`).
No old dashboard code is ported, referenced, or "adapted".

## Consequences
- All dashboard behavior is re-specified through CONTEXT.md → PRD → issues before code.
- The firmware's data shapes and path layout constrain every design decision (ADR-0003).
- Known firmware quirks are inherited knowingly: dummy PZEM values, no energy history,
  unused `mainRelay` command, hardcoded `property_001`/`room_001`, anonymous device auth.
