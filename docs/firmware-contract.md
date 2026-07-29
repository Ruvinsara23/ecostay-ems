# ESP32 Firmware ↔ Firebase RTDB Contract (Ground Truth)

Source: `complete.ino` (verified identical to `firmware/Final_code/complete.ino` @ `green-home-hub#Final`, commit `61668a1`).
This contract is **fixed** — the hardware integration is kept as-is; the new dashboard must conform to it.

Occupancy amendment (ADR-0011): the user-supplied sketch currently flashed to the
bench ESP32 is captured, with the approved vacancy fix, at
`firmware/current-upload-fixed/current-upload-fixed.ino`. This isolated flash candidate
does not replace the repository's canonical `firmware/complete.ino`; reconciliation is a
separate firmware task. It changes no RTDB path, telemetry field, type, cadence, or relay
command semantics.

Comfort-load amendments (ADR-0012, ADR-0014): the current flash candidate allows
requested lights, fan, and AC only in `OCCUPIED_ACTIVE` and `OCCUPIED_IDLE`.
It blocks them during entry, sleep, exit, and vacancy while preserving the gas
override. When blocked, the device clears its own three Firebase command leaves
to `false` through an off-only, room-scoped RTDB permission.

AC relay amendment (ADR-0013): the approved flash candidate adds the boolean
`devices/airConditioner` command on a separate active-low GPIO21 output. It follows the
same sensor-confirmed occupancy gate as the other comfort loads. `mainRelay` remains
unused and excluded. Physical AC switching requires an isolated, correctly rated
contactor/dry-contact/IR interface; GPIO21 never drives mains directly.

## Identity

| Item | Value |
|---|---|
| Property ID | `property_001` (hardcoded) |
| Room ID | `room_001` (hardcoded) |
| Base path | `properties/property_001/rooms/room_001` |
| Canonical `complete.ino` auth | **Anonymous** `Firebase.signUp(&config, &auth, "", "")`; retained only by the transitional bench telemetry rule. It cannot clear command leaves. |
| Approved `current-upload-fixed` auth | Provisioned device email/password with matching `role=device`, `propertyId`, and `roomId` claims. Missing or malformed credentials leave the node offline. This identity is required for ADR-0014 command clearing. |
| WiFi | SSID `ESP32` / `12345678` (hardcoded) |
| API key + DB URL | Hardcoded in both repository firmware artifacts and now target `ecostay-ems` (ADR-0009, hardware-verified 2026-07-04). Path layout, field names, and cadence are unchanged. |

## Telemetry — firmware WRITES `{base}/latest` every 3 s (`updateNode`)

| Field | Type | Notes |
|---|---|---|
| `voltage` | float | ⚠️ **DUMMY** — sine wave ~216–230 V, no real PZEM read |
| `current` | float | ⚠️ DUMMY — derived `power/voltage` |
| `power` | float | ⚠️ DUMMY — sine wave ~4.41–5.0 W |
| `energy` | float | ⚠️ DUMMY — integrates dummy power, kWh |
| `gas` | int | 0–1000 "ppm" (linear map of raw ADC); alarm > 300 |
| `pir` | bool | raw PIR state |
| `doorOpen` | bool | reed switch, LOW = open |
| `temperature` | float | DHT11, °C |
| `humidity` | float | DHT11, % |
| `lightLevel` | int | **always 0** — no sensor |
| `waterLevel` | int | 0–100 % (analog map) |
| `flowRate` | float | L/min |
| `totalLiters` | float | session-accumulated (resets on reboot) |
| `relayStatus` | bool | mirrors *presence* relay only |
| `buzzerStatus` | bool | buzzer or gas alarm active |
| `occupancyState` | string | see state machine below |
| `humanPresent` | bool | ultrasonic ≤ 50 cm OR PIR |
| `motionDetected` | bool | same as `pir` |
| `updatedAt` | server ts | `.sv: timestamp` |

## History — firmware PUSHES `properties/property_001/history` (only when `flowRate > 0`)

`{ roomId, flowRate, deltaLiters, totalLiters, temperature, humidity, createdAt(server ts) }`

⚠️ Water-flow-gated: **no energy history is ever written by firmware.** Any energy time-series chart has no firmware-fed source.

## Commands — firmware READS every 500 ms (plain booleans)

ADR-0014 also permits the authenticated device to write boolean `false` to its
own lights, fan, and AC command leaves. It cannot write `true`, the pump,
`mainRelay`, or any other room.

| Path | Relay pin | Behavior |
|---|---|---|
| `{base}/devices/exhaustFan` | GPIO 26 | Allowed only in active/idle; gas alarm **overrides ON** locally |
| `{base}/devices/airConditioner` | GPIO 21 (ADR-0013 candidate) | Allowed only in active/idle |
| `{base}/devices/motionDetection` | GPIO 14 | Drives "presence" relay directly |
| `{base}/devices/lights` | GPIO 13 | Allowed only in active/idle |
| `{base}/devices/waterPump` | GPIO 5 | Direct |
| `{base}/devices/mainRelay` | — | **Read but never used** in relay logic |

## On-device occupancy state machine

States: `VACANT → ENTRY_DETECTED → OCCUPIED_ACTIVE ⇄ OCCUPIED_IDLE → OCCUPIED_SLEEPING`, `EXIT_PENDING → VACANT_CONFIRMED`.
Inputs: door reed, PIR, ultrasonic (≤ 50 cm). Timeouts: 10 s
(active→idle) and 30 s (idle→sleeping). In the ADR-0011 flash candidate,
`ENTRY_DETECTED` and `EXIT_PENDING` can transition to `VACANT_CONFIRMED` only
after the door is closed and both presence sensors remain clear continuously
for 30 s. Any PIR or ultrasonic detection resets that complete window.
Runs **on the ESP32** — the dashboard should *display* this state, never re-derive it.

## Pin map (reference)

| Function | Pin | | Function | Pin |
|---|---|---|---|---|
| Relay: exhaust fan | 26 | | Ultrasonic TRIG/ECHO | 18 / 19 |
| Relay: presence | 14 | | DHT11 | 4 |
| Relay: lights | 13 | | Gas (analog) | 32 |
| Relay: pump | 5 | | Water level (analog) | 34 |
| Relay: AC (ADR-0013 candidate) | 21 | | AC interface | Isolated/rated external stage |
| PIR | 27 | | Flow (pulse) | 35 |
| Door reed | 33 | | Buzzer | 25 |
| Onboard/ext LED | 2 / 23 | | Relays are **active-LOW** | |

## Consequences for the new dashboard

1. **Single room reality**: `property_001/room_001` is hardcoded — multi-room/multi-hotel UI must be honest about being single-node for now, or the firmware gains a config step.
2. **Energy data is simulated** until a real PZEM-004T read replaces `updatePzemDummyReading()` — label it in the UI.
3. Commands are **plain bool leaves** with no relay acknowledgement or queue.
   The 3D UI combines command state with the occupancy gate; the device may
   clear disallowed comfort commands to `false`.
4. `latest` is a 3 s snapshot; **history for charts must be recorded by something other than the firmware** (scheduled function / client logger) or the firmware gains an energy-history push.
5. Canonical `complete.ino` anonymous auth remains a transitional bench-only limitation: it cannot distinguish the node from another anonymous client and cannot clear commands. The credentialed `current-upload-fixed` candidate resolves that identity problem with room-scoped claims.
