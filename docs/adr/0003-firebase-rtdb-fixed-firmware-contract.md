# ADR-0003: Keep Firebase RTDB + Auth; the firmware contract is immutable

Date: 2026-07-04 · Status: Accepted

## Context
The deployed ESP32 firmware (`firmware/complete.ino`) already writes telemetry to
Firebase Realtime Database every 3 s and polls command booleans every 500 ms
(full contract: `docs/firmware-contract.md`). Reflashing/redesigning firmware mid-capstone
is high-risk and the hardware integration is the part that already works.

## Decision
- Data layer is Firebase **Realtime Database** (not Firestore) on the existing project/paths.
- Dashboard auth is **Firebase Auth** (email/password for owners).
- The firmware-side contract — path layout, field names, types, write cadence, anonymous
  device sign-in — is treated as **immutable** for the rebuild. The dashboard adapts to it,
  never the reverse.
- Any firmware change (e.g. real PZEM reads, energy history push, config-able room ID)
  is a separate, explicitly approved workstream with its own ADR.

## Consequences
- UI must label energy values as simulated until firmware gains real PZEM reads.
- Charts need a non-firmware history recorder (open question in CONTEXT.md).
- RTDB security rules must accommodate anonymous device writes while restricting
  human access — a named risk gate in AGENTS.md.
- Single room (`property_001/room_001`) is the honest cardinality of the system today.
