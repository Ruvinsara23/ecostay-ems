# ADR-0013: Add a separate air-conditioner command and relay

Date: 2026-07-29 · Status: Accepted · Amends: ADR-0003, ADR-0012

## Context

The room requires the air conditioner to follow the same sensor-confirmed
occupancy automation as the lights and exhaust fan. The existing four relay
outputs are already assigned to the fan, presence relay, lights, and water pump.
`mainRelay` is read by the legacy firmware but has no output pin and remains an
unsafe, ambiguous target.

## Decision

- Add the boolean command
  `properties/{propertyId}/rooms/{roomId}/devices/airConditioner`.
- Drive it through a separate active-low output on GPIO21 in the approved flash
  candidate.
- Vacancy Cutoff writes `airConditioner=false` together with lights and fan.
- Occupancy Restore writes `airConditioner=true` only after PIR or ultrasonic
  confirmation produces an active, idle, or sleeping occupied state.
- Keep `mainRelay` excluded from the typed contract, UI, and automation.
- In Wokwi, model the AC as a separate relay and a 1,000 W simulated PZEM load.
- On physical hardware, GPIO21 may drive only an isolated relay input,
  manufacturer-supported dry contact, IR bridge, or correctly rated contactor.
  It must never switch a compressor load directly from the ESP32 or a small
  hobby relay.

## Consequences

- The dashboard, server automation, firmware, 3D model, and simulator share one
  explicit AC command.
- The previous four-relay version remains recoverable at
  `backup/pre-ac-relay-2026-07-29` and in the separate pre-AC artifacts.
- Existing installations need the fifth relay/contactor wiring and updated
  flash candidate before the new dashboard toggle can control a physical AC.
- The UI still displays commanded state: no AC relay acknowledgement telemetry
  has been added.
- Existing savings math continues to use only the reviewed lights/fan circuit
  wattages. AC savings are deliberately not claimed until an Admin-configured
  AC wattage and the money-facing calculation receive separate approval.
