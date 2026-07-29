# Current uploaded firmware — occupancy fix

`current-upload-fixed.ino` is a byte-preserved copy of the sketch supplied from
the currently flashed bench ESP32, plus the ADR-0011 occupancy correction and
the approved ADR-0013 separate AC relay.

This folder is an isolated **flash candidate**. The repository's canonical
firmware remains `firmware/complete.ino`; this copy does not silently replace it
or merge that file's unrelated local edits.

## Required source files

The sketch and occupancy header are one build unit. Do not copy the `.ino`
without its companion header.

For a PlatformIO/Wokwi project, use this layout:

```text
src/
  sketch.ino              # copy/rename current-upload-fixed.ino
  occupancy-policy.h      # copy without renaming
```

The header is compatible with PlatformIO's C++11 ESP32 toolchain as well as the
newer Arduino CLI ESP32 toolchain.

## Occupancy behavior

- A closed door alone never proves vacancy.
- `ENTRY_DETECTED` records a door-open candidate but does not energize requested
  fan, light, or AC loads.
- PIR or ultrasonic presence advances the room to `OCCUPIED_ACTIVE`, where
  requested fan, light, and AC commands are allowed.
- Requested fan, light, and AC commands remain allowed in `OCCUPIED_IDLE`.
- `OCCUPIED_SLEEPING`, `EXIT_PENDING`, `VACANT`, and `VACANT_CONFIRMED`
  block all three comfort loads. The gas alarm may still force the fan on.
- When blocked, the device clears its own Firebase fan, light, and AC commands
  to `false`. Production RTDB rules must include the ADR-0014 off-only,
  room-scoped device permission.
- During `ENTRY_DETECTED` or `EXIT_PENDING`, the door must be closed and both
  PIR and ultrasonic presence must remain clear continuously for 30 seconds.
- Any PIR motion, ultrasonic presence at 50 cm or nearer, or reopened door
  resets the complete 30-second window.

The 30-second entry timeout is intentional; it replaces the old approximately
10-second door-age decision so a closed door alone cannot prove vacancy.

## Verification

Run the focused regression check:

```powershell
node firmware/current-upload-fixed/test-occupancy-policy.mjs
node firmware/current-upload-fixed/test-ac-relay.mjs
```

Compile for the physical ESP32:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/current-upload-fixed
```

Before flashing, confirm the Wi-Fi placeholders and device provisioning values
for the target room. Flashing a physical node remains a human-approved hardware
operation.

The AC command uses active-low GPIO21 as a fifth output. Connect it only to an
isolated relay input, manufacturer-supported dry contact/IR bridge, or a
properly rated contactor. Do not connect an ESP32 or hobby relay directly to an
air-conditioner compressor circuit.
