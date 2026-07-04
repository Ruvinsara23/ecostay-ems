# ESP32 Firmware ↔ Firebase RTDB Contract (Ground Truth)

Source: `complete.ino` (verified identical to `firmware/Final_code/complete.ino` @ `green-home-hub#Final`, commit `61668a1`).
This contract is **fixed** — the hardware integration is kept as-is; the new dashboard must conform to it.

## Identity

| Item | Value |
|---|---|
| Property ID | `property_001` (hardcoded) |
| Room ID | `room_001` (hardcoded) |
| Base path | `properties/property_001/rooms/room_001` |
| Firebase auth | **Anonymous** `Firebase.signUp(&config, &auth, "", "")` |
| WiFi | SSID `ESP32` / `12345678` (hardcoded) |
| API key + DB URL | Hardcoded in firmware (`esp32led-b6105-c0b99` project, asia-southeast1) |

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

| Path | Relay pin | Behavior |
|---|---|---|
| `{base}/devices/exhaustFan` | GPIO 26 | Gas alarm **overrides ON** locally |
| `{base}/devices/motionDetection` | GPIO 14 | Drives "presence" relay directly |
| `{base}/devices/lights` | GPIO 13 | Direct |
| `{base}/devices/waterPump` | GPIO 5 | Direct |
| `{base}/devices/mainRelay` | — | **Read but never used** in relay logic |

## On-device occupancy state machine

States: `VACANT → ENTRY_DETECTED → OCCUPIED_ACTIVE ⇄ OCCUPIED_IDLE → OCCUPIED_SLEEPING`, `EXIT_PENDING → VACANT_CONFIRMED`.
Inputs: door reed, PIR, ultrasonic (≤ 50 cm). Timeouts: 10 s (active→idle, entry→vacant-confirmed), 30 s (idle→sleeping, exit→vacant-confirmed).
Runs **on the ESP32** — the dashboard should *display* this state, never re-derive it.

## Pin map (reference)

| Function | Pin | | Function | Pin |
|---|---|---|---|---|
| Relay: exhaust fan | 26 | | Ultrasonic TRIG/ECHO | 18 / 19 |
| Relay: presence | 14 | | DHT11 | 4 |
| Relay: lights | 13 | | Gas (analog) | 32 |
| Relay: pump | 5 | | Water level (analog) | 34 |
| PIR | 27 | | Flow (pulse) | 35 |
| Door reed | 33 | | Buzzer | 25 |
| Onboard/ext LED | 2 / 23 | | Relays are **active-LOW** | |

## Consequences for the new dashboard

1. **Single room reality**: `property_001/room_001` is hardcoded — multi-room/multi-hotel UI must be honest about being single-node for now, or the firmware gains a config step.
2. **Energy data is simulated** until a real PZEM-004T read replaces `updatePzemDummyReading()` — label it in the UI.
3. Commands are **plain bool leaf writes** — no ack, no command queue; UI state should reflect `{base}/latest` telemetry, not assume a write succeeded.
4. `latest` is a 3 s snapshot; **history for charts must be recorded by something other than the firmware** (scheduled function / client logger) or the firmware gains an energy-history push.
5. Anonymous device auth means RTDB rules can't distinguish device from stranger — rules design is a risk gate for the rebuild.
