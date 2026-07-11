# 05 - Real PZEM-004T readings (implementation plan, 2026-07-12)

Status: IMPLEMENTED (gate #7 approved 2026-07-12) — awaiting hardware for bench verification
Compile: `arduino-cli compile --fqbn esp32:esp32:esp32` clean, 97% flash / 15% RAM
(PZEM004Tv30 1.2.1, esp32 core 3.3.8). ⚠ 97% flash: next growth likely needs a
bigger-app partition scheme (e.g. Huge APP 3MB) at flash time.
Blocked on: PZEM-004T v3.0 module (not purchased yet) → wiring → reflash → verification
plan below → then slice 06 cutover (drop "Simulated" badge).
Parent: `.scratch/firmware-workstream/PRD.md`

## Goal

Replace `updatePzemDummyReading()` with real PZEM-004T v3.0 reads while keeping the
contract shape frozen (same field names, numeric types, 3 s cadence — ADR-0003/0007).
This is the gate to the real-data milestone: once verified on the bench, cost/savings
become real and the dashboard's "Simulated" label is removed (separate slice 06 cutover).

## Ground truth (verified in complete.ino, 2026-07-12)

- `updatePzemDummyReading()` (line ~271) already runs on a 3 s timer; it feeds
  `pzemVoltage/Current/Power/Energy`, uploaded in `uploadLatestTelemetry()` (line ~612).
- `updateDHTReading()` keeps last-known-good on NaN reads — the bench node's 0 °C means
  the DHT11 has NEVER returned a valid read (values still at boot init). Hardware fix
  (wiring/pull-up/sensor), plus a firmware diagnostic so silent failure can't recur.
- Serial "flood" is the sum of per-event prints (distance/door/motion/upload block),
  not the PZEM line.

## Proposed firmware changes (need gate #7 approval BEFORE editing)

1. **PZEM read path** — library `PZEM004Tv30` (mandulaj/PZEM-004T-v30, the de-facto
   standard), on `Serial2` (**RX2 = GPIO16, TX2 = GPIO17** — both free in the pin map).
   `updatePzemReading()` keeps the 3 s timer; reads voltage/current/power/energy;
   **NaN/failed reads keep last-known-good and never write invalid JSON**; a
   consecutive-failure counter prints a wiring warning every 30 s.
2. **Energy semantics** — use the meter's cumulative-kWh register as `energy`
   (persists across ESP32 reboots — strictly better than the dummy, which reset;
   the sampler's negative-delta guard then only fires on a real meter reset).
3. **DHT11 diagnostic** — count consecutive failed reads; after 10, print
   "DHT11: N failed reads — check wiring/pull-up" every 30 s. No contract change.
4. **Serial hygiene** — gate per-event chatter (distance/door/motion/PZEM line) behind
   `#define DEBUG_VERBOSE 0`; keep provisioning prompts, errors, and the 3 s upload
   summary always-on.

Explicitly unchanged: paths, field names/types, cadence, command polling, occupancy
machine, provisioning/auth (slices 03-04), no firmware energy-history writes.

## Hardware / human checklist (blocking bench verification)

- PZEM-004T **v3.0** module wired: 5V/GND to ESP32, PZEM TX → GPIO16, PZEM RX → GPIO17
  (module is 3.3 V-signal tolerant on v3.0), mains L/N through the meter + CT coil around
  the live wire. **Mains wiring is the human's job — never energize an open bench.**
- DHT11: confirm data on GPIO4 with a 10 kΩ pull-up to 3.3 V; replace sensor if reads
  still fail.
- Reflash via Arduino IDE (local creds already in the working copy; repo copy stays
  scrubbed — stage firmware changes only via a placeholder-checked diff).

## Verification plan

1. Bench serial: finite, plausible V/I/P/E; known load (e.g. a 60-100 W bulb or kettle)
   lands in the expected wattage range.
2. RTDB `latest`: real values flowing, `updatedAt` fresh, no NaN/null fields.
3. Sampler/rollup smoke: `energyHistory` shows real cumulative deltas; no negative-delta
   surprises across an ESP32 reboot.
4. Only then → slice 06 cutover: remove the "Simulated" badge
   (`room-live-view.tsx`, `energy-charts.tsx`, `contract.ts` comments + tests) and add
   the contract version note (ADR-0007). Gate #8 eyeball of the first real bill figures.

## Risk gates

- #7 firmware (this file IS the approval request).
- #8 indirectly: money becomes real only after the human verifies meter readings.
