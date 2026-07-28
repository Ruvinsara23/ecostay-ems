# ADR-0011: Confirm vacancy from continuous sensor clearance

Date: 2026-07-28 · Status: Accepted · Amends: ADR-0003

## Context

The current ESP32 sketch treated elapsed time after a door closure as sufficient
evidence of vacancy. A guest can enter, close the door, and remain in the room, so
the door state alone cannot decide occupancy. The user explicitly approved a
firmware change using the existing PIR and ultrasonic sensors.

The sketch supplied from the currently flashed bench ESP32 differs substantially
from the repository's canonical `firmware/complete.ino`. That canonical file also
has unrelated local edits, so replacing it inside this workstream would risk
overwriting or silently combining work.

## Decision

- During `ENTRY_DETECTED` and `EXIT_PENDING`, the device confirms vacancy only
  when the door is closed and neither PIR nor ultrasonic detects a person
  continuously for 30 seconds.
- Any PIR motion, ultrasonic presence at 50 cm or nearer, or reopened door resets
  the complete 30-second vacancy window.
- The RTDB path layout, telemetry fields and types, command paths, relay semantics,
  and sensor pin assignments are unchanged.
- Preserve the user-supplied deployed baseline plus this focused correction at
  `firmware/current-upload-fixed/current-upload-fixed.ino`.
- `firmware/complete.ino` remains the repository's canonical firmware artifact.
  The isolated corrected sketch is a flash candidate pending an explicit
  reconciliation workstream; it must not be mistaken for a silent replacement.

## Consequences

- Closing the door no longer marks a possibly occupied room vacant.
- Vacancy-based load cutoff waits at least 30 seconds after both presence inputs
  become clear, reducing false cutoffs for guests still inside.
- Firmware and dashboard remain separated: the ESP32 produces
  `occupancyState`; the dashboard only displays it.
- Before the next canonical firmware release, reconcile the supplied deployed
  sketch with `firmware/complete.ino` and retain this occupancy policy.
