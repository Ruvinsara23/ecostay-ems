# Current uploaded firmware — occupancy fix

`current-upload-fixed.ino` is a byte-preserved copy of the sketch supplied from
the currently flashed bench ESP32, plus the ADR-0011 occupancy correction.

This folder is an isolated **flash candidate**. The repository's canonical
firmware remains `firmware/complete.ino`; this copy does not silently replace it
or merge that file's unrelated local edits.

## Occupancy behavior

- A closed door alone never proves vacancy.
- During `ENTRY_DETECTED` or `EXIT_PENDING`, the door must be closed and both
  PIR and ultrasonic presence must remain clear continuously for 30 seconds.
- Any PIR motion, ultrasonic presence at 50 cm or nearer, or reopened door
  resets the complete 30-second window.

## Verification

Run the focused regression check:

```powershell
node firmware/current-upload-fixed/test-occupancy-policy.mjs
```

Compile for the physical ESP32:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/current-upload-fixed
```

Before flashing, confirm the Wi-Fi placeholders and device provisioning values
for the target room. Flashing a physical node remains a human-approved hardware
operation.
