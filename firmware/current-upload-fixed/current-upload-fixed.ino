#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <DHT.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include "occupancy-policy.h"

Preferences preferences;

// ======================
// BUILD TARGET / WiFi
// ======================
// 1 = Wokwi integration build. Uses Wokwi-GUEST and enables the optional
//     SIM_LOAD serial command for isolated relay/PZEM verification.
// 0 = Physical ESP32 build. Replace the two placeholders before flashing.
#ifndef ECOSTAY_WOKWI_SIMULATION
#define ECOSTAY_WOKWI_SIMULATION 0
#endif

#if ECOSTAY_WOKWI_SIMULATION
constexpr char WIFI_SSID[] = "Wokwi-GUEST";
constexpr char WIFI_PASSWORD[] = "";
#define SIMULATED_GAS_PPM 250
#else
constexpr char WIFI_SSID[] = "YOUR_WIFI_SSID";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
#endif

#define ECOSTAY_SIMULATION_QUIET_MODE ECOSTAY_WOKWI_SIMULATION

// ======================
// DEBUG
// ======================
// 1 = per-event sensor chatter (distance/DHT/PZEM/motion prints).
// Provisioning prompts, errors, and door events stay on regardless. The
// simulation build suppresses routine upload summaries through quiet mode.
#define DEBUG_VERBOSE 0

// ======================
// Firebase Credentials
// ======================
// ADR-0009 project migration (firmware workstream step 0) — only these two constants changed.
#define API_KEY "AIzaSyAiPORxuRkkWLdg3ZdAj6gXXgUn0uqf_7Y"
#define DATABASE_URL "https://ecostay-ems-default-rtdb.asia-southeast1.firebasedatabase.app/"

// ======================
// Firebase Objects
// ======================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

bool signupOK = false;
bool wifiConnected = false;

// ======================
// Device IDs
// ======================
String propertyId = "";
String roomId = "";
String deviceEmail = "";
String devicePassword = "";
String basePath;

const char DEVICE_EMAIL_DOMAIN[] = "devices.ecostay.local";

// ======================
// LED PINS
// ======================
const int ledPin = 2;
const int extLedPin = 23;  // External status LED in diagram.json

// ======================
// RELAY CONFIG
// ======================
#define RELAY_ACTIVE_LOW true

#define RELAY_EXHAUST_FAN 26  // Perpul wire = IN 3  ok
#define RELAY_PRESENCE 14     // Gray = IN 4  ok
#define RELAY_LIGHTS 13       // green wire = IN 1  ok
#define RELAY_PUMP 5          // Yellow wire = IN 2   ok
#define RELAY_AIR_CONDITIONER 21  // Separate fifth relay / rated AC contactor input

// ======================
// SENSOR PINS
// ======================
const int flowPin = 35;         // ok
#define WATER_SENSOR_PIN 34     //ok
#define GAS_SENSOR_PIN 32       //ok
const int BUZZER_PIN = 25;      // ok
#define DOOR_SWITCH_PIN 33      //ok
#define PIR_PIN 27              //ok
#define ULTRASONIC_TRIG_PIN 17  // trig  17
#define ULTRASONIC_ECHO_PIN 16  // echo 16
#define DHTPIN  4                //  ok

// Wokwi provides a DHT22 part, while the physical EcoStay prototype uses a
// DHT11. Select the matching protocol without changing the physical build.
#if ECOSTAY_WOKWI_SIMULATION
constexpr uint8_t DHTTYPE = DHT22;
constexpr char DHT_SENSOR_NAME[] = "DHT22 (Wokwi)";
#else
constexpr uint8_t DHTTYPE = DHT11;
constexpr char DHT_SENSOR_NAME[] = "DHT11";
#endif

// ======================
// Firebase paths
// ======================
String pathExhaust;
String pathMotion;
String pathLights;
String pathPump;
String pathAirConditioner;
String pathMainRelay;

const float GAS_DETECTED_THRESHOLD = 500.0;

// ======================
// TEMPERATURE / HUMIDITY SENSOR
// ======================
DHT dht(DHTPIN, DHTTYPE);

// ======================
// FLOW SENSOR
// ======================
volatile int pulseCount = 0;
float flowRate = 0.0;
float totalLiters = 0.0;
float deltaLiters = 0.0;
float calibrationFactor = 320.0;
unsigned long lastFlowCalc = 0;
float pendingHistoryDeltaLiters = 0.0;

// ======================
// WATER SENSOR
// ======================
#define DRY_VALUE 1200
#define WET_VALUE 1800
constexpr int WATER_PUMP_ON_THRESHOLD_PERCENT = 20;
constexpr int WATER_PUMP_OFF_THRESHOLD_PERCENT = 80;
int waterPercent = 0;
unsigned long lastWaterRead = 0;
bool pumpAutoState = false;

// ======================
// GAS SENSOR
// ======================
int gasPpm = 0;
unsigned long lastGasRead = 0;
bool gasAlarmActive = false;

// ======================
// DOOR / PIR / OCCUPANCY
// ======================
bool doorAlertDone = false;
int lastDoorState = -1;
int lastPIRState = -1;
bool lastHumanDetected = false;
unsigned long lastHumanTime = 0;
bool relay2State = false;

bool doorOpen = false;
bool pirDetected = false;
bool humanDetected = false;

unsigned long lastDoorChangeAt = 0;
unsigned long lastMotionAt = 0;
VacancyClearTimer vacancyClearTimer = {false, 0};

String occupancyState = "VACANT";

const unsigned long OCC_IDLE_TIMEOUT = 10000;
const unsigned long OCC_VACANCY_TIMEOUT = 30000;

// ======================
// DISTANCE VARIABLE
// ======================
float currentDistance = 0.0;
unsigned long lastDistanceRead = 0;
const unsigned long DISTANCE_INTERVAL = 500;

// ======================
// TEMPERATURE / HUMIDITY
// ======================
float temperature = 0.0;
float humidity = 0.0;
unsigned long lastDHTRead = 0;
const unsigned long DHT_INTERVAL = 2000;
uint16_t dhtFailedReads = 0;
unsigned long lastDhtWarnAt = 0;

// ======================
// PZEM-004T v3.0 (real reads - ADR-0007 slice 05)
// ESP32 RX2 (GPIO16) <- PZEM TX  ·  ESP32 TX2 (GPIO17) -> PZEM RX
// ======================
#define PZEM_RX_PIN 18  //ok
#define PZEM_TX_PIN 19  //ok
#define PZEM_ADDRESS 0x01
PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN, PZEM_ADDRESS);
// Honest zeros until the meter answers - never the old fake sine wave.
float pzemVoltage = 0.0f;
float pzemCurrent = 0.0f;
float pzemPower = 0.0f;
float pzemEnergy = 0.0f;
unsigned long lastPzemRead = 0;
uint16_t pzemFailedReads = 0;
unsigned long lastPzemWarnAt = 0;

// ======================
// COMMAND / RUNTIME STATES
// ======================
bool cmdExhaust = false;
bool cmdMotionEnable = false;
bool cmdLights = false;
bool cmdPump = false;
bool cmdAirConditioner = false;
bool cmdMainRelay = false;

bool relayFan = false;
bool relayPresence = false;
bool relayLight = false;
bool relayPump = false;
bool relayAirConditioner = false;
bool buzzerState = false;

#if ECOSTAY_WOKWI_SIMULATION
// Disabled until a SIM_LOAD command is entered. Normal Firebase commands keep
// working whenever this override is inactive.
bool simLoadOverride = false;
bool simFanRequest = false;
bool simLightRequest = false;

// Simulation-only occupancy input overrides. These replace only the sensor
// reads; updateOccupancyState() remains the single occupancy logic under test.
bool simDoorOverrideActive = false;
bool simDoorOpen = false;
bool simPirOverrideActive = false;
bool simPirDetected = false;
bool simDistanceOverrideActive = false;
float simDistanceCm = 150.0f;
bool simWaterOverrideActive = false;
int simWaterPercent = 50;

enum SimScenarioAction : uint8_t {
  SIM_ACTION_DOOR_OPEN,
  SIM_ACTION_DOOR_CLOSE,
  SIM_ACTION_PIR_PULSE,
  SIM_ACTION_SET_DISTANCE,
  SIM_ACTION_MARKER,
  SIM_ACTION_PIR_RELEASE
};

struct SimScenarioEntry {
  uint32_t offsetMs;
  SimScenarioAction action;
  float value;
  const char *label;
};

// Short deterministic verification timeline. It exercises entry, a sustained
// still period, sleeping without vacancy, and confirmed vacancy after exit.
const SimScenarioEntry SIM_SCENARIO_SHORT[] = {
  {     0, SIM_ACTION_MARKER,       0.0f, "scenario_start" },
  {     0, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {     0, SIM_ACTION_SET_DISTANCE, 150.0f, nullptr },
  {  1000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  {  2000, SIM_ACTION_SET_DISTANCE, 40.0f, nullptr },
  {  2500, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {  5000, SIM_ACTION_PIR_PULSE,    1000.0f, nullptr },
  { 15000, SIM_ACTION_MARKER,       0.0f, "still_period_start" },
  { 15000, SIM_ACTION_SET_DISTANCE, 150.0f, nullptr },
  { 76000, SIM_ACTION_MARKER,       0.0f, "still_period_61s" },
  { 80000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  { 82000, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {122000, SIM_ACTION_MARKER,       0.0f, "vacancy_wait_40s" },
  {123000, SIM_ACTION_MARKER,       0.0f, "scenario_end" }
};

// Twenty-six-minute end-to-end automation pilot. Presence is deliberately
// driven only by distance so a distance-override failure cannot be hidden by PIR.
const SimScenarioEntry SIM_SCENARIO_PILOT[] = {
  {      0, SIM_ACTION_MARKER,       0.0f, "pilot_start" },
  {      0, SIM_ACTION_SET_DISTANCE, 150.0f, nullptr },
  {      0, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {   2000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  {   4000, SIM_ACTION_SET_DISTANCE, 40.0f, nullptr },
  {   6000, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  { 300000, SIM_ACTION_MARKER,       0.0f, "exit_1" },
  { 300000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  { 302000, SIM_ACTION_SET_DISTANCE, 150.0f, nullptr },
  { 304000, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  { 780000, SIM_ACTION_MARKER,       0.0f, "return_1" },
  { 780000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  { 782000, SIM_ACTION_SET_DISTANCE, 40.0f, nullptr },
  { 784000, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {1080000, SIM_ACTION_MARKER,       0.0f, "exit_2" },
  {1080000, SIM_ACTION_DOOR_OPEN,    1.0f, nullptr },
  {1082000, SIM_ACTION_SET_DISTANCE, 150.0f, nullptr },
  {1084000, SIM_ACTION_DOOR_CLOSE,   0.0f, nullptr },
  {1560000, SIM_ACTION_MARKER,       0.0f, "pilot_end" }
};

struct SimScenarioDefinition {
  const char *name;
  const SimScenarioEntry *entries;
  size_t entryCount;
};

const SimScenarioDefinition SIM_SCENARIOS[] = {
  {
    "short",
    SIM_SCENARIO_SHORT,
    sizeof(SIM_SCENARIO_SHORT) / sizeof(SIM_SCENARIO_SHORT[0])
  },
  {
    "pilot",
    SIM_SCENARIO_PILOT,
    sizeof(SIM_SCENARIO_PILOT) / sizeof(SIM_SCENARIO_PILOT[0])
  }
};

constexpr size_t SIM_SCENARIO_COUNT =
  sizeof(SIM_SCENARIOS) / sizeof(SIM_SCENARIOS[0]);
constexpr size_t SIM_SCENARIO_DEFAULT_INDEX = 0;
constexpr size_t SIM_SCENARIO_PENDING_CAPACITY = 4;

struct SimScenarioTranscriptEvent {
  uint32_t elapsedMs;
  uint32_t scheduledMs;
  SimScenarioAction action;
  float value;
  const char *label;
};

SimScenarioTranscriptEvent simPendingEvents[SIM_SCENARIO_PENDING_CAPACITY];
size_t simPendingEventCount = 0;
bool simScenarioRunning = false;
bool simScenarioCompleted = false;
bool simScenarioCompletionPending = false;
size_t simScenarioPosition = 0;
uint32_t simScenarioStartedAt = 0;
bool simPirPulseActive = false;
uint32_t simPirReleaseOffsetMs = 0;
String simLastTranscriptOccupancy = "VACANT";
const SimScenarioDefinition *simActiveScenario =
  &SIM_SCENARIOS[SIM_SCENARIO_DEFAULT_INDEX];

// Explicit prototypes keep Arduino's .ino preprocessor from emitting
// simulation-type declarations outside this compile-time guard.
const char *simScenarioActionName(SimScenarioAction action);
const SimScenarioDefinition *findSimulationScenario(const String &selector);
void printSimulationScenarioList();
void releaseSimulationOccupancyOverrides();
void queueSimScenarioEvent(
  uint32_t elapsedMs,
  uint32_t scheduledMs,
  SimScenarioAction action,
  float value,
  const char *label
);
void resetOccupancyForScenario(uint32_t now);
void startSimulationScenario(const SimScenarioDefinition &scenario);
void stopSimulationScenario();
void printSimulationScenarioStatus();
void executeSimulationScenarioEntry(
  const SimScenarioEntry &entry,
  uint32_t elapsedMs
);
void updateSimulationScenario();
void printSimScenarioLabel(const char *label);
void printSimScenarioEvent(const SimScenarioTranscriptEvent &event);
void flushSimulationScenarioTranscript();
#endif

// ======================
// TIMERS
// ======================
unsigned long lastFirebaseUpload = 0;
unsigned long lastCommandRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastLEDUpdate = 0;
unsigned long firebaseBlinkTime = 0;
bool firebaseNotReadyReported = false;

const unsigned long FLOW_INTERVAL = 1000;
const unsigned long WATER_INTERVAL = 1000;
const unsigned long GAS_INTERVAL = 1000;
const unsigned long FIREBASE_INTERVAL = 3000;
const unsigned long COMMAND_INTERVAL = 500;
const unsigned long PZEM_INTERVAL = 3000;
const unsigned long LED_POLL_INTERVAL = 1500;

// ======================
// ISR
// ======================
void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

// ======================
// HELPER FUNCTIONS
// ======================
void writeRelay(int pin, bool state) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(pin, state ? LOW : HIGH);
  } else {
    digitalWrite(pin, state ? HIGH : LOW);
  }
}

void applyRelays() {
  writeRelay(RELAY_EXHAUST_FAN, relayFan);
  writeRelay(RELAY_PRESENCE, relayPresence);
  writeRelay(RELAY_LIGHTS, relayLight);
  writeRelay(RELAY_PUMP, relayPump);
  writeRelay(RELAY_AIR_CONDITIONER, relayAirConditioner);
}

bool fbReadBool(const char *path, bool fallback) {
  if (Firebase.RTDB.getBool(&fbdo, path)) {
    return fbdo.boolData();
  }
  return fallback;
}

float fbReadFloat(const char *path, float fallback) {
  if (Firebase.RTDB.getFloat(&fbdo, path)) {
    return fbdo.floatData();
  }
  return fallback;
}

void beep(int delayTime) {
  buzzerState = true;
  digitalWrite(BUZZER_PIN, HIGH);
  delay(delayTime);
  digitalWrite(BUZZER_PIN, LOW);
  buzzerState = false;
}

float getDistance() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000);
  if (duration == 0) return 999;

  return duration * 0.0343 / 2;
}

const char *occupancyStateToString(const String &state) {
  return state.c_str();
}

bool isOccupiedState(const String &state) {
  return state == "ENTRY_DETECTED" || state == "OCCUPIED_ACTIVE" || state == "OCCUPIED_IDLE" || state == "OCCUPIED_SLEEPING" || state == "EXIT_PENDING";
}

bool comfortLoadsAllowed(const String &state) {
  return state == "OCCUPIED_ACTIVE" || state == "OCCUPIED_IDLE" || state == "OCCUPIED_SLEEPING" || state == "EXIT_PENDING";
}

#if ECOSTAY_WOKWI_SIMULATION
const char *simScenarioActionName(SimScenarioAction action) {
  switch (action) {
    case SIM_ACTION_DOOR_OPEN: return "DOOR_OPEN";
    case SIM_ACTION_DOOR_CLOSE: return "DOOR_CLOSE";
    case SIM_ACTION_PIR_PULSE: return "PIR_PULSE";
    case SIM_ACTION_SET_DISTANCE: return "SET_DISTANCE";
    case SIM_ACTION_MARKER: return "MARKER";
    case SIM_ACTION_PIR_RELEASE: return "PIR_RELEASE";
  }
  return "UNKNOWN";
}

const SimScenarioDefinition *findSimulationScenario(const String &selector) {
  String normalized = selector;
  normalized.trim();
  normalized.toLowerCase();

  if (normalized.length() == 0) {
    return &SIM_SCENARIOS[SIM_SCENARIO_DEFAULT_INDEX];
  }

  for (size_t i = 0; i < SIM_SCENARIO_COUNT; i++) {
    if (
      normalized == SIM_SCENARIOS[i].name ||
      normalized == String(static_cast<unsigned int>(i))
    ) {
      return &SIM_SCENARIOS[i];
    }
  }

  return nullptr;
}

void printSimulationScenarioList() {
  Serial.printf(
    "SIM_SCENARIO_LIST count=%u default=%s\n",
    static_cast<unsigned int>(SIM_SCENARIO_COUNT),
    SIM_SCENARIOS[SIM_SCENARIO_DEFAULT_INDEX].name
  );

  for (size_t i = 0; i < SIM_SCENARIO_COUNT; i++) {
    const SimScenarioDefinition &scenario = SIM_SCENARIOS[i];
    uint32_t durationMs = scenario.entryCount > 0
      ? scenario.entries[scenario.entryCount - 1].offsetMs
      : 0;
    Serial.printf(
      "SIM_SCENARIO_OPTION index=%u name=%s entries=%u duration_ms=%lu\n",
      static_cast<unsigned int>(i),
      scenario.name,
      static_cast<unsigned int>(scenario.entryCount),
      static_cast<unsigned long>(durationMs)
    );
  }
}

void releaseSimulationOccupancyOverrides() {
  simDoorOverrideActive = false;
  simPirOverrideActive = false;
  simDistanceOverrideActive = false;
  simPirPulseActive = false;
}

void queueSimScenarioEvent(
  uint32_t elapsedMs,
  uint32_t scheduledMs,
  SimScenarioAction action,
  float value,
  const char *label
) {
  if (simPendingEventCount >= SIM_SCENARIO_PENDING_CAPACITY) {
    Serial.println("SIM_SCENARIO_ERROR reason=transcript_queue_full");
    return;
  }

  SimScenarioTranscriptEvent &event = simPendingEvents[simPendingEventCount++];
  event.elapsedMs = elapsedMs;
  event.scheduledMs = scheduledMs;
  event.action = action;
  event.value = value;
  event.label = label;
}

void resetOccupancyForScenario(uint32_t now) {
  doorAlertDone = false;
  lastDoorState = -1;
  lastPIRState = -1;
  lastHumanDetected = false;
  lastHumanTime = now;
  relay2State = false;

  doorOpen = false;
  pirDetected = false;
  humanDetected = false;
  currentDistance = 150.0f;
  lastDoorChangeAt = now;
  lastMotionAt = now;
  occupancyState = "VACANT";
}

void startSimulationScenario(const SimScenarioDefinition &scenario) {
  uint32_t now = millis();

  simActiveScenario = &scenario;
  simScenarioStartedAt = now;
  simScenarioPosition = 0;
  simPendingEventCount = 0;
  simScenarioRunning = true;
  simScenarioCompleted = false;
  simScenarioCompletionPending = false;
  simPirPulseActive = false;
  simLastTranscriptOccupancy = "VACANT";

  // Deterministic baseline. Table actions then modify these inputs at their
  // declared offsets before the normal sensor fusion/state machine executes.
  simDoorOverrideActive = true;
  simDoorOpen = false;
  simPirOverrideActive = true;
  simPirDetected = false;
  simDistanceOverrideActive = true;
  simDistanceCm = 150.0f;
  resetOccupancyForScenario(now);

  Serial.printf(
    "SIM_SCENARIO_START elapsed_ms=0 scenario=%s entries=%u occupancy=%s\n",
    simActiveScenario->name,
    static_cast<unsigned int>(simActiveScenario->entryCount),
    occupancyState.c_str()
  );
}

void stopSimulationScenario() {
  uint32_t elapsedMs = simScenarioRunning
    ? millis() - simScenarioStartedAt
    : 0;

  simScenarioRunning = false;
  simScenarioCompleted = false;
  simScenarioCompletionPending = false;
  simScenarioPosition = 0;
  simPendingEventCount = 0;
  releaseSimulationOccupancyOverrides();

  Serial.printf(
    "SIM_SCENARIO_STOP elapsed_ms=%lu overrides=released occupancy=%s\n",
    static_cast<unsigned long>(elapsedMs),
    occupancyState.c_str()
  );
}

void printSimulationScenarioStatus() {
  uint32_t elapsedMs =
    (simScenarioRunning || simScenarioCompleted)
      ? millis() - simScenarioStartedAt
      : 0;

  const char *state = simScenarioRunning
    ? "running"
    : (simScenarioCompleted ? "completed" : "idle");

  Serial.printf(
    "SIM_SCENARIO_STATUS state=%s elapsed_ms=%lu position=%u total=%u "
    "scenario=%s door_override=%u pir_override=%u distance_override=%u "
    "occupancy=%s\n",
    state,
    static_cast<unsigned long>(elapsedMs),
    static_cast<unsigned int>(simScenarioPosition),
    static_cast<unsigned int>(simActiveScenario->entryCount),
    simActiveScenario->name,
    simDoorOverrideActive ? 1 : 0,
    simPirOverrideActive ? 1 : 0,
    simDistanceOverrideActive ? 1 : 0,
    occupancyState.c_str()
  );
}

void executeSimulationScenarioEntry(
  const SimScenarioEntry &entry,
  uint32_t elapsedMs
) {
  switch (entry.action) {
    case SIM_ACTION_DOOR_OPEN:
      simDoorOverrideActive = true;
      simDoorOpen = true;
      break;

    case SIM_ACTION_DOOR_CLOSE:
      simDoorOverrideActive = true;
      simDoorOpen = false;
      break;

    case SIM_ACTION_PIR_PULSE: {
      uint32_t durationMs = entry.value > 0.0f
        ? static_cast<uint32_t>(entry.value)
        : 1000;
      simPirOverrideActive = true;
      simPirDetected = true;
      simPirPulseActive = true;
      simPirReleaseOffsetMs = entry.offsetMs + durationMs;
      break;
    }

    case SIM_ACTION_SET_DISTANCE:
      simDistanceOverrideActive = true;
      simDistanceCm = entry.value;
      // Make the existing non-blocking distance task consume the new value in
      // this loop, before updateOccupancyState() and transcript emission.
      lastDistanceRead = millis() - DISTANCE_INTERVAL;
      break;

    case SIM_ACTION_MARKER:
      break;

    case SIM_ACTION_PIR_RELEASE:
      // Internal event only; never placed in the compiled scenario table.
      break;
  }

  queueSimScenarioEvent(
    elapsedMs,
    entry.offsetMs,
    entry.action,
    entry.value,
    entry.label
  );
}

void updateSimulationScenario() {
  if (!simScenarioRunning) {
    return;
  }

  uint32_t elapsedMs = millis() - simScenarioStartedAt;
  bool actionExecuted = false;

  if (simPirPulseActive && elapsedMs >= simPirReleaseOffsetMs) {
    simPirDetected = false;
    simPirPulseActive = false;
    queueSimScenarioEvent(
      elapsedMs,
      simPirReleaseOffsetMs,
      SIM_ACTION_PIR_RELEASE,
      0.0f,
      nullptr
    );
    actionExecuted = true;
  }

  // Execute at most one action per loop. The normal sensor updates and
  // updateOccupancyState() therefore evaluate every action independently
  // before its transcript record is printed.
  if (
    !actionExecuted &&
    simScenarioPosition < simActiveScenario->entryCount &&
    elapsedMs >= simActiveScenario->entries[simScenarioPosition].offsetMs
  ) {
    const SimScenarioEntry &entry =
      simActiveScenario->entries[simScenarioPosition];
    executeSimulationScenarioEntry(entry, elapsedMs);
    simScenarioPosition++;
    actionExecuted = true;
  }

  if (
    simScenarioPosition == simActiveScenario->entryCount &&
    !simPirPulseActive
  ) {
    simScenarioRunning = false;
    simScenarioCompleted = true;
    simScenarioCompletionPending = true;
  }
}

void printSimScenarioLabel(const char *label) {
  Serial.print('"');
  if (label != nullptr) {
    for (const char *cursor = label; *cursor != '\0'; cursor++) {
      char value = *cursor;
      switch (value) {
        case '\\': Serial.print("\\\\"); break;
        case '"': Serial.print("\\\""); break;
        case '\n': Serial.print("\\n"); break;
        case '\r': Serial.print("\\r"); break;
        case '\t': Serial.print("\\t"); break;
        default:
          if (static_cast<uint8_t>(value) < 0x20) {
            Serial.printf(
              "\\u%04x",
              static_cast<unsigned int>(static_cast<uint8_t>(value))
            );
          } else {
            Serial.print(value);
          }
      }
    }
  }
  Serial.print('"');
}

void printSimScenarioEvent(const SimScenarioTranscriptEvent &event) {
  Serial.printf(
    "SIM_SCENARIO_EVENT elapsed_ms=%lu scheduled_ms=%lu action=%s",
    static_cast<unsigned long>(event.elapsedMs),
    static_cast<unsigned long>(event.scheduledMs),
    simScenarioActionName(event.action)
  );

  switch (event.action) {
    case SIM_ACTION_DOOR_OPEN:
      Serial.print(" value=1");
      break;
    case SIM_ACTION_DOOR_CLOSE:
      Serial.print(" value=0");
      break;
    case SIM_ACTION_PIR_PULSE:
      Serial.printf(
        " duration_ms=%lu",
        static_cast<unsigned long>(event.value)
      );
      break;
    case SIM_ACTION_SET_DISTANCE:
      Serial.printf(" value_cm=%.1f", event.value);
      break;
    case SIM_ACTION_MARKER:
      Serial.print(" label=");
      printSimScenarioLabel(event.label);
      break;
    case SIM_ACTION_PIR_RELEASE:
      Serial.print(" value=0");
      break;
  }

  Serial.print(" occupancy=");
  Serial.println(occupancyState);
}

void flushSimulationScenarioTranscript() {
  for (size_t i = 0; i < simPendingEventCount; i++) {
    printSimScenarioEvent(simPendingEvents[i]);
  }
  simPendingEventCount = 0;

  if (
    (simScenarioRunning || simScenarioCompletionPending) &&
    occupancyState != simLastTranscriptOccupancy
  ) {
    Serial.printf(
      "SIM_SCENARIO_STATE elapsed_ms=%lu from=%s to=%s\n",
      static_cast<unsigned long>(millis() - simScenarioStartedAt),
      simLastTranscriptOccupancy.c_str(),
      occupancyState.c_str()
    );
    simLastTranscriptOccupancy = occupancyState;
  }

  if (simScenarioCompletionPending) {
    simScenarioCompletionPending = false;
    Serial.printf(
      "SIM_SCENARIO_COMPLETE elapsed_ms=%lu occupancy=%s\n",
      static_cast<unsigned long>(millis() - simScenarioStartedAt),
      occupancyState.c_str()
    );
    releaseSimulationOccupancyOverrides();
    Serial.println("SIM_SCENARIO_OVERRIDES_RELEASED door=0 pir=0 distance=0");
  }
}
#endif

// ======================
// PZEM-004T TELEMETRY (real reads - ADR-0007 slice 05)
// ======================
void updatePzemReading() {
  if (millis() - lastPzemRead < PZEM_INTERVAL) {
    return;
  }

  lastPzemRead = millis();

  float v = pzem.voltage();
  float i = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();

  if (isnan(v) || isnan(i) || isnan(p) || isnan(e)) {
    // Keep last-known-good values - never write NaN into telemetry.
    if (pzemFailedReads < 65535) pzemFailedReads++;
    if (pzemFailedReads >= 10 && millis() - lastPzemWarnAt >= 30000) {
      lastPzemWarnAt = millis();
      Serial.printf("PZEM: %u failed reads - check wiring on GPIO%d/GPIO%d\n",
                    pzemFailedReads, PZEM_RX_PIN, PZEM_TX_PIN);
    }
    return;
  }

  pzemFailedReads = 0;
  pzemVoltage = v;
  pzemCurrent = i;
  pzemPower = p;
  pzemEnergy = e;  // meter-cumulative kWh: survives ESP32 reboots

#if DEBUG_VERBOSE
  Serial.printf("PZEM -> V: %.1f V, I: %.3f A, P: %.2f W, E: %.4f kWh\n",
                pzemVoltage, pzemCurrent, pzemPower, pzemEnergy);
#endif
}

// ======================
// UPDATE TEMPERATURE / HUMIDITY READING
// ======================
void updateDHTReading() {
  if (millis() - lastDHTRead >= DHT_INTERVAL) {
    lastDHTRead = millis();

    float newHumidity = dht.readHumidity();
    float newTemperature = dht.readTemperature();

    if (isnan(newHumidity) || isnan(newTemperature)) {
      // Silent-failure guard: a dead/miswired DHT sensor otherwise leaves the boot
      // value 0.0 in telemetry forever with nothing on the wire to say why.
      if (dhtFailedReads < 65535) dhtFailedReads++;
      if (dhtFailedReads >= 10 && millis() - lastDhtWarnAt >= 30000) {
        lastDhtWarnAt = millis();
        Serial.printf("%s: %u failed reads - check wiring/pull-up on GPIO%d\n",
                      DHT_SENSOR_NAME, dhtFailedReads, DHTPIN);
      }
      return;
    }

    dhtFailedReads = 0;
    humidity = newHumidity;
    temperature = newTemperature;

#if DEBUG_VERBOSE
    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.print(" C  Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
#endif

    if (temperature > 40) {
      Serial.println("HIGH TEMPERATURE ALERT");
      beep(100);
    }

    if (humidity > 80) {
      Serial.println("HIGH HUMIDITY ALERT");
      beep(100);
    }
  }
}

// ======================
// UPDATE DISTANCE READING
// ======================
void updateDistanceReading() {
  if (millis() - lastDistanceRead >= DISTANCE_INTERVAL) {
    lastDistanceRead = millis();
#if ECOSTAY_WOKWI_SIMULATION
    if (simDistanceOverrideActive) {
      currentDistance = simDistanceCm;
    } else {
      currentDistance = getDistance();
    }
#else
    currentDistance = getDistance();
#endif

#if DEBUG_VERBOSE
    if (currentDistance <= 200) {
      Serial.print("Distance: ");
      Serial.print(currentDistance);
      Serial.println(" cm");
    }
#endif
  }
}

// ======================
// FLOW SENSOR
// ======================
void updateFlowReading() {
  if (millis() - lastFlowCalc >= FLOW_INTERVAL) {
    lastFlowCalc = millis();

    noInterrupts();
    int pulses = pulseCount;
    pulseCount = 0;
    interrupts();

    deltaLiters = pulses / calibrationFactor;
    totalLiters += deltaLiters;
    pendingHistoryDeltaLiters += deltaLiters;
    flowRate = deltaLiters * 60.0;
  }
}

// ======================
// WATER SENSOR
// ======================
void updateWaterReading() {
  if (millis() - lastWaterRead >= WATER_INTERVAL) {
    lastWaterRead = millis();
#if ECOSTAY_WOKWI_SIMULATION
    if (simWaterOverrideActive) {
      waterPercent = simWaterPercent;
      return;
    }
#endif
    int raw = analogRead(WATER_SENSOR_PIN);
    waterPercent = map(raw, DRY_VALUE, WET_VALUE, 0, 100);
    waterPercent = constrain(waterPercent, 0, 100);
  }
}

// ======================
// GAS SENSOR
// ======================
void updateGasReading() {
  if (millis() - lastGasRead >= GAS_INTERVAL) {
    lastGasRead = millis();

#if ECOSTAY_WOKWI_SIMULATION
    gasPpm = SIMULATED_GAS_PPM;
#else
    int raw = analogRead(GAS_SENSOR_PIN);
    gasPpm = map(raw, 0, 4095, 0, 1000);
#endif
    gasAlarmActive = gasPpm > 300;

    if (gasAlarmActive) {
      digitalWrite(BUZZER_PIN, HIGH);
      buzzerState = true;
      delay(200);
      digitalWrite(BUZZER_PIN, LOW);
      buzzerState = false;
      delay(200);
      digitalWrite(BUZZER_PIN, HIGH);
      buzzerState = true;
      delay(200);
      digitalWrite(BUZZER_PIN, LOW);
      buzzerState = false;
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      buzzerState = false;
    }
  }
}

// ======================
// DOOR SENSOR
// ======================
void updateDoorReading() {
#if ECOSTAY_WOKWI_SIMULATION
  int doorState = simDoorOverrideActive
    ? (simDoorOpen ? LOW : HIGH)
    : digitalRead(DOOR_SWITCH_PIN);
#else
  int doorState = digitalRead(DOOR_SWITCH_PIN);
#endif
  bool newDoorOpen = (doorState == LOW);

  if (doorState != lastDoorState) {
    Serial.print("DOOR STATE: ");
    Serial.println(doorState ? "CLOSED" : "OPEN");

    if (doorState == 0 && !doorAlertDone) {
      Serial.println("DOOR OPEN ALERT");
      beep(300);
      doorAlertDone = true;
    }

    if (doorState == 1) {
      Serial.println("DOOR CLOSED");
      doorAlertDone = false;
    }

    lastDoorState = doorState;
    lastDoorChangeAt = millis();
  }

  doorOpen = newDoorOpen;
}

// ======================
// PIR SENSOR
// ======================
void updatePIRReading() {
#if ECOSTAY_WOKWI_SIMULATION
  int pirState = simPirOverrideActive
    ? (simPirDetected ? HIGH : LOW)
    : digitalRead(PIR_PIN);
#else
  int pirState = digitalRead(PIR_PIN);
#endif
  bool newPirDetected = (pirState == HIGH);

  if (pirState != lastPIRState) {
    if (pirState == 1) {
#if DEBUG_VERBOSE
      Serial.println("MOTION DETECTED");
#endif
      beep(120);
    }
    lastPIRState = pirState;
    if (newPirDetected) {
      lastMotionAt = millis();
    }
  }

  pirDetected = newPirDetected;
}

// ======================
// HUMAN / OCCUPANCY LOGIC
// ======================
void updateOccupancyState() {
  bool newHumanDetected = (currentDistance <= 50.0f) || pirDetected;

  if (newHumanDetected) {
    lastHumanTime = millis();
    lastMotionAt = millis();
  }

  if (newHumanDetected != lastHumanDetected) {
    if (newHumanDetected) {
#if DEBUG_VERBOSE
      Serial.print("HUMAN DETECTED - DIST: ");
      Serial.print(currentDistance);
      Serial.println(" cm");
#endif
      beep(200);
    } else {
#if DEBUG_VERBOSE
      Serial.println("AREA CLEAR");
#endif
    }
    lastHumanDetected = newHumanDetected;
  }

  humanDetected = newHumanDetected;

  unsigned long now = millis();
  unsigned long secondsSinceMotion = (now - lastMotionAt) / 1000;

  // A closed door is not evidence that the room is empty. Only arm the
  // vacancy timer during an unresolved entry/exit, and require both presence
  // sensors to remain clear continuously for the complete timeout.
  bool vacancyPhase =
    occupancyState == "ENTRY_DETECTED" || occupancyState == "EXIT_PENDING";
  bool vacancyTimerWasActive = vacancyClearTimer.active;
  VacancyClearEvaluation vacancyClear = evaluateVacancyClearWindow(
    vacancyClearTimer,
    vacancyPhase,
    doorOpen,
    humanDetected,
    static_cast<uint32_t>(now),
    static_cast<uint32_t>(OCC_VACANCY_TIMEOUT)
  );
  vacancyClearTimer = vacancyClear.timer;

  if (!vacancyTimerWasActive && vacancyClearTimer.active) {
#if DEBUG_VERBOSE
    Serial.println("VACANCY CHECK STARTED - PIR AND ULTRASONIC CLEAR");
#endif
  }

  if (occupancyState == "VACANT" || occupancyState == "VACANT_CONFIRMED") {
    if (doorOpen) {
      occupancyState = "ENTRY_DETECTED";
    } else if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    }
  } else if (occupancyState == "ENTRY_DETECTED") {
    if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    } else if (vacancyClear.confirmed) {
      occupancyState = "VACANT_CONFIRMED";
      vacancyClearTimer.active = false;
    }
  } else if (occupancyState == "OCCUPIED_ACTIVE") {
    if (doorOpen) {
      occupancyState = "EXIT_PENDING";
    } else if (!humanDetected && secondsSinceMotion > 10) {
      occupancyState = "OCCUPIED_IDLE";
    }
  } else if (occupancyState == "OCCUPIED_IDLE") {
    if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    } else if (secondsSinceMotion > 30) {
      occupancyState = "OCCUPIED_SLEEPING";
    } else if (doorOpen) {
      occupancyState = "EXIT_PENDING";
    }
  } else if (occupancyState == "OCCUPIED_SLEEPING") {
    if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    } else if (doorOpen) {
      occupancyState = "EXIT_PENDING";
    }
  } else if (occupancyState == "EXIT_PENDING") {
    if (!doorOpen) {
      if (humanDetected) {
        occupancyState = "OCCUPIED_ACTIVE";
      } else if (vacancyClear.confirmed) {
        occupancyState = "VACANT_CONFIRMED";
        vacancyClearTimer.active = false;
      }
    }
  }

  relay2State = isOccupiedState(occupancyState);
}

// ======================
// READ DEVICE COMMANDS
// ======================
void readDeviceCommands() {
  if (millis() - lastCommandRead < COMMAND_INTERVAL) {
    return;
  }
  lastCommandRead = millis();

  if (!Firebase.ready() || !signupOK) {
    return;
  }

  cmdExhaust = fbReadBool(pathExhaust.c_str(), cmdExhaust);
  cmdMotionEnable = fbReadBool(pathMotion.c_str(), cmdMotionEnable);
  cmdLights = fbReadBool(pathLights.c_str(), cmdLights);
  cmdPump = fbReadBool(pathPump.c_str(), cmdPump);
  cmdAirConditioner = fbReadBool(pathAirConditioner.c_str(), cmdAirConditioner);
  cmdMainRelay = fbReadBool(pathMainRelay.c_str(), true);
}

// ======================
// LOGIC ENGINE
// ======================
void updateLogic() {
  bool requestedFan = cmdExhaust;
  bool requestedLight = cmdLights;

#if ECOSTAY_WOKWI_SIMULATION
  if (simLoadOverride) {
    requestedFan = simFanRequest;
    requestedLight = simLightRequest;
  }
#endif

  bool occupancyAllowsComfortLoads = comfortLoadsAllowed(occupancyState);

  // The gas-safety override retains priority over dashboard/simulation input.
  relayFan = gasAlarmActive ? true : (occupancyAllowsComfortLoads && requestedFan);
  relayLight = occupancyAllowsComfortLoads && requestedLight;
  relayAirConditioner = occupancyAllowsComfortLoads && cmdAirConditioner;

  if (waterPercent < WATER_PUMP_ON_THRESHOLD_PERCENT) {
    pumpAutoState = true;
  } else if (waterPercent > WATER_PUMP_OFF_THRESHOLD_PERCENT) {
    pumpAutoState = false;
  }
  relayPump = pumpAutoState || cmdPump;

  relayPresence = cmdMotionEnable;

  applyRelays();
}

// ======================
// LED EFFECTS
// ======================
void wifiConnectingBlink() {
  digitalWrite(extLedPin, HIGH);
  delay(100);
  digitalWrite(extLedPin, LOW);
  delay(100);
}

void wifiConnectedBreathing() {
  float wave = (sin(millis() * 0.002) + 1.0) / 2.0;
  int brightness = wave * 255;
  analogWrite(extLedPin, brightness);
}

void firebaseBlinkPulse() {
  digitalWrite(extLedPin, HIGH);
  delay(50);
  digitalWrite(extLedPin, LOW);
}

void systemHeartbeat() {
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    digitalWrite(extLedPin, HIGH);
    delay(80);
    digitalWrite(extLedPin, LOW);
  }
}

// ======================
// FIREBASE UPLOAD
// ======================
void uploadLatestTelemetry() {
  if (millis() - lastFirebaseUpload < FIREBASE_INTERVAL) {
    return;
  }
  lastFirebaseUpload = millis();

  if (Firebase.ready() && signupOK) {
    firebaseNotReadyReported = false;
    FirebaseJson payload;

    payload.set("voltage", pzemVoltage);
    payload.set("current", pzemCurrent);
    payload.set("power", pzemPower);
    payload.set("energy", pzemEnergy);
    payload.set("gas", gasPpm);
    payload.set("pir", pirDetected);
    payload.set("doorOpen", doorOpen);
    payload.set("temperature", temperature);
    payload.set("humidity", humidity);
    payload.set("lightLevel", 0);
    payload.set("waterLevel", waterPercent);
    payload.set("flowRate", flowRate);
    payload.set("totalLiters", totalLiters);
    payload.set("relayStatus", relayPresence);
    payload.set("buzzerStatus", buzzerState || gasAlarmActive);
    payload.set("occupancyState", occupancyState);
    payload.set("humanPresent", humanDetected);
    payload.set("motionDetected", pirDetected);
#if ECOSTAY_WOKWI_SIMULATION
    payload.set("simulatorUptimeMs", static_cast<uint32_t>(millis()));
#endif
    payload.set("updatedAt/.sv", "timestamp");

    bool success = Firebase.RTDB.updateNode(&fbdo, basePath + "/latest", &payload);
    if (success) {
      // Physical-build heartbeat; simulation quiet mode suppresses it.
#if !ECOSTAY_SIMULATION_QUIET_MODE
      Serial.printf("Upload OK | %.1f C  %.1f %%  %.1f W  %.4f kWh  %s\n",
                    temperature, humidity, pzemPower, pzemEnergy, occupancyState.c_str());
#endif
      firebaseBlinkPulse();
    } else {
      Serial.print("Firebase upload failed: ");
      Serial.println(fbdo.errorReason());
    }

    if (flowRate > 0.0) {
      FirebaseJson history;
      history.set("roomId", roomId);
      history.set("flowRate", flowRate);
      history.set("deltaLiters", pendingHistoryDeltaLiters);
      history.set("totalLiters", totalLiters);
      history.set("temperature", temperature);
      history.set("humidity", humidity);
      history.set("createdAt/.sv", "timestamp");

      bool ok = Firebase.RTDB.pushJSON(
        &fbdo,
        "properties/" + propertyId + "/history",
        &history);

      if (ok) {
        pendingHistoryDeltaLiters = 0.0;
#if !ECOSTAY_SIMULATION_QUIET_MODE
        Serial.println("Flow history uploaded");
#endif
      }
    }
  } else {
#if ECOSTAY_SIMULATION_QUIET_MODE
    if (!firebaseNotReadyReported) {
      Serial.println("Firebase not ready");
      firebaseNotReadyReported = true;
    }
#else
    Serial.println("Firebase not ready");
#endif
  }
}

// ======================
// PROVISIONING
// ======================
void drainSerialActivationLine() {
  // Serial Monitor can deliver the line ending just after the triggering 'p'.
  // Wait for a short quiet period so a late CR/LF cannot become the first answer.
  unsigned long quietSince = millis();
  while (millis() - quietSince < 50) {
    while (Serial.available()) {
      Serial.read();
      quietSince = millis();
    }
    delay(1);
  }
}

String expectedDeviceEmail() {
  return "device+" + propertyId + "+" + roomId + "@" + String(DEVICE_EMAIL_DOMAIN);
}

bool hasBasicEmailShape(const String &email) {
  int at = email.indexOf('@');
  return email.length() > 3 && at > 0 && at == email.lastIndexOf('@') && email.indexOf(' ') < 0;
}

void printProvisioningStatus() {
  Serial.println("\n--- DEVICE CONFIG ---");
  Serial.print("Property ID: ");
  if (propertyId.length() > 0) {
    Serial.println(propertyId);
  } else {
    Serial.println("<not set>");
  }
  Serial.print("Room ID: ");
  if (roomId.length() > 0) {
    Serial.println(roomId);
  } else {
    Serial.println("<not set>");
  }
  Serial.print("Base path: ");
  if (basePath.length() > 0) {
    Serial.println(basePath);
  } else {
    Serial.println("<not built yet>");
  }
  Serial.print("Device email: ");
  if (deviceEmail.length() > 0) {
    Serial.println(deviceEmail);
  } else {
    Serial.println("<not set>");
  }
  Serial.print("Expected device email for this room: ");
  Serial.println(expectedDeviceEmail());
  Serial.print("Device password: ");
  Serial.println(devicePassword.length() > 0 ? "<set, hidden>" : "<not set>");
  Serial.println("Serial commands:");
  Serial.println("  PRINT_CONFIG");
  Serial.println("  CLEAR_CONFIG");
  Serial.println("  SET_CONFIG <propertyId> <roomId> <deviceEmail> <devicePassword>");
#if ECOSTAY_WOKWI_SIMULATION
  Serial.println("Wokwi load-test commands:");
  Serial.println("  SIM_LOAD OFF | LAMP | FAN | BOTH");
  Serial.println("  SIM_CMD_LOAD OFF | LAMP | FAN | BOTH  (simulate Firebase commands)");
  Serial.println("  SIM_CMD_AC 0|1  (simulate Firebase airConditioner command)");
  Serial.println("  SIM_PZEM STATUS  (read-only power/energy diagnostic)");
  Serial.println("  SIM_AUTO  (return control to Firebase)");
  Serial.println("Wokwi occupancy-test commands:");
  Serial.println("  SIM_SCENARIO START [name|index]");
  Serial.println("  SIM_SCENARIO LIST | STOP | STATUS");
  Serial.println("  SIM_DOOR 0|1  (0=closed, 1=open)");
  Serial.println("  SIM_PIR 0|1");
  Serial.println("  SIM_DISTANCE <cm>");
  Serial.println("  SIM_CMD_PUMP 0|1  (simulate Firebase waterPump command)");
  Serial.println("  SIM_WATER <percent> | AUTO");
#endif
}

void clearProvisioning() {
  preferences.remove("propertyId");
  preferences.remove("roomId");
  preferences.remove("deviceEmail");
  preferences.remove("devicePassword");
  Serial.println("Provisioning cleared. Rebooting...");
  delay(1000);
  ESP.restart();
}

void promptProvisioning() {
  Serial.println("\n--- PROVISIONING MODE ---");

  drainSerialActivationLine();

  Serial.println("Enter Property ID (or press Enter to skip):");
  while (!Serial.available()) { delay(10); }
  String p = Serial.readStringUntil('\n');
  p.trim();
  if (p.length() > 0) preferences.putString("propertyId", p);

  Serial.println("Enter Room ID (or press Enter to skip):");
  while (!Serial.available()) { delay(10); }
  String r = Serial.readStringUntil('\n');
  r.trim();
  if (r.length() > 0) preferences.putString("roomId", r);

  Serial.println("Enter Device Email (or press Enter to skip):");
  while (!Serial.available()) { delay(10); }
  String e = Serial.readStringUntil('\n');
  e.trim();
  if (e.length() > 0) preferences.putString("deviceEmail", e);

  Serial.println("Enter Device Password (or press Enter to skip):");
  while (!Serial.available()) { delay(10); }
  String pw = Serial.readStringUntil('\n');
  pw.trim();
  if (pw.length() > 0) preferences.putString("devicePassword", pw);

  Serial.println("Provisioning saved! Rebooting...");
  delay(1000);
  ESP.restart();
}

void loadProvisioning() {
  preferences.begin("ecostay", false);

  propertyId = preferences.getString("propertyId", "");
  roomId = preferences.getString("roomId", "");
  deviceEmail = preferences.getString("deviceEmail", "");
  devicePassword = preferences.getString("devicePassword", "");

  if (propertyId == "" || roomId == "") {
    Serial.println("Device unprovisioned. Using bench node defaults (property_001 / room_001).");
    propertyId = "property_001";
    roomId = "room_001";
  }

  Serial.println("\n>>> Press 'p' within 5 seconds to enter Provisioning Mode...");
  unsigned long start = millis();
  while (millis() - start < 5000) {
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'p' || c == 'P') {
        promptProvisioning();
      }
    }
    delay(10);
  }
}

void handleSerialCommand(const String &cmd) {
#if ECOSTAY_WOKWI_SIMULATION
  if (cmd == "SIM_SCENARIO START" || cmd.startsWith("SIM_SCENARIO START ")) {
    String selector = cmd.substring(String("SIM_SCENARIO START").length());
    const SimScenarioDefinition *scenario = findSimulationScenario(selector);
    if (scenario == nullptr) {
      Serial.printf(
        "SIM_SCENARIO_ERROR reason=unknown_scenario selector=\"%s\"\n",
        selector.c_str()
      );
      printSimulationScenarioList();
      return;
    }
    startSimulationScenario(*scenario);
    return;
  }

  if (cmd == "SIM_SCENARIO STOP") {
    stopSimulationScenario();
    return;
  }

  if (cmd == "SIM_SCENARIO STATUS") {
    printSimulationScenarioStatus();
    return;
  }

  if (cmd == "SIM_SCENARIO LIST") {
    printSimulationScenarioList();
    return;
  }

  if (cmd.startsWith("SIM_SCENARIO")) {
    Serial.println(
      "Usage: SIM_SCENARIO START [name|index] | LIST | STOP | STATUS"
    );
    return;
  }

  if (cmd.startsWith("SIM_DOOR ")) {
    if (simScenarioRunning) {
      Serial.println("SIM_OVERRIDE_ERROR input=door reason=scenario_running");
      return;
    }

    String value = cmd.substring(9);
    value.trim();
    if (value != "0" && value != "1") {
      Serial.println("Usage: SIM_DOOR 0|1  (0=closed, 1=open)");
      return;
    }

    simDoorOverrideActive = true;
    simDoorOpen = value == "1";
    Serial.printf(
      "SIM_OVERRIDE input=door active=1 value=%u\n",
      simDoorOpen ? 1 : 0
    );
    return;
  }

  if (cmd.startsWith("SIM_PIR ")) {
    if (simScenarioRunning) {
      Serial.println("SIM_OVERRIDE_ERROR input=pir reason=scenario_running");
      return;
    }

    String value = cmd.substring(8);
    value.trim();
    if (value != "0" && value != "1") {
      Serial.println("Usage: SIM_PIR 0|1");
      return;
    }

    simPirOverrideActive = true;
    simPirDetected = value == "1";
    simPirPulseActive = false;
    Serial.printf(
      "SIM_OVERRIDE input=pir active=1 value=%u\n",
      simPirDetected ? 1 : 0
    );
    return;
  }

  if (cmd.startsWith("SIM_DISTANCE ")) {
    if (simScenarioRunning) {
      Serial.println(
        "SIM_OVERRIDE_ERROR input=distance reason=scenario_running"
      );
      return;
    }

    String value = cmd.substring(13);
    value.trim();
    const char *start = value.c_str();
    char *end = nullptr;
    float distanceCm = strtof(start, &end);
    if (
      value.length() == 0 ||
      end == start ||
      *end != '\0' ||
      !isfinite(distanceCm) ||
      distanceCm < 0.0f
    ) {
      Serial.println("Usage: SIM_DISTANCE <cm>");
      return;
    }

    simDistanceOverrideActive = true;
    simDistanceCm = distanceCm;
    lastDistanceRead = millis() - DISTANCE_INTERVAL;
    Serial.printf(
      "SIM_OVERRIDE input=distance active=1 value_cm=%.1f\n",
      simDistanceCm
    );
    return;
  }

  if (cmd.startsWith("SIM_WATER ")) {
    String value = cmd.substring(10);
    value.trim();
    value.toUpperCase();

    if (value == "AUTO") {
      simWaterOverrideActive = false;
      Serial.println("SIM_OVERRIDE input=water active=0");
      return;
    }

    const char *start = value.c_str();
    char *end = nullptr;
    long percent = strtol(start, &end, 10);
    if (
      value.length() == 0 ||
      end == start ||
      *end != '\0' ||
      percent < 0 ||
      percent > 100
    ) {
      Serial.println("Usage: SIM_WATER <percent 0..100> | AUTO");
      return;
    }

    simWaterOverrideActive = true;
    simWaterPercent = static_cast<int>(percent);
    lastWaterRead = millis() - WATER_INTERVAL;
    updateWaterReading();
    updateLogic();
    Serial.printf(
      "SIM_OVERRIDE input=water active=1 value_percent=%d pump=%s\n",
      simWaterPercent,
      relayPump ? "ON" : "OFF"
    );
    return;
  }

  if (cmd.startsWith("SIM_CMD_PUMP ")) {
    String value = cmd.substring(13);
    value.trim();

    if (value != "0" && value != "1") {
      Serial.println("Usage: SIM_CMD_PUMP 0|1");
      return;
    }

    cmdPump = (value == "1");
    updateLogic();
    Serial.printf(
      "SIM_CMD input=pump value=%u pump=%s\n",
      cmdPump ? 1 : 0,
      relayPump ? "ON" : "OFF"
    );
    return;
  }

  if (cmd.startsWith("SIM_CMD_AC ")) {
    String value = cmd.substring(11);
    value.trim();

    if (value != "0" && value != "1") {
      Serial.println("Usage: SIM_CMD_AC 0|1");
      return;
    }

    cmdAirConditioner = (value == "1");
    updateLogic();
    lastPzemRead = millis() - PZEM_INTERVAL;
    Serial.printf(
      "SIM_CMD input=airConditioner value=%u occupancy=%s ac=%s\n",
      cmdAirConditioner ? 1 : 0,
      occupancyState.c_str(),
      relayAirConditioner ? "ON" : "OFF"
    );
    return;
  }

  if (cmd.startsWith("SIM_CMD_LOAD ")) {
    String load = cmd.substring(13);
    load.trim();
    load.toUpperCase();

    if (load == "OFF") {
      cmdExhaust = false;
      cmdLights = false;
    } else if (load == "LAMP") {
      cmdExhaust = false;
      cmdLights = true;
    } else if (load == "FAN") {
      cmdExhaust = true;
      cmdLights = false;
    } else if (load == "BOTH") {
      cmdExhaust = true;
      cmdLights = true;
    } else {
      Serial.println("Usage: SIM_CMD_LOAD OFF | LAMP | FAN | BOTH");
      return;
    }

    simLoadOverride = false;
    updateLogic();
    lastPzemRead = millis() - PZEM_INTERVAL;

    Serial.printf(
      "SIM_CMD input=load value=%s occupancy=%s fan=%s light=%s\n",
      load.c_str(),
      occupancyState.c_str(),
      relayFan ? "ON" : "OFF",
      relayLight ? "ON" : "OFF"
    );
    return;
  }

  if (cmd == "SIM_AUTO") {
    simLoadOverride = false;
    Serial.println("SIM load override disabled; Firebase commands are active.");
    return;
  }

  if (cmd == "SIM_PZEM STATUS") {
    lastPzemRead = millis() - PZEM_INTERVAL;
    updatePzemReading();
    Serial.printf(
      "SIM_PZEM_STATUS uptime_ms=%lu power_w=%.1f energy_kwh=%.6f\n",
      static_cast<unsigned long>(millis()),
      pzemPower,
      pzemEnergy
    );
    return;
  }

  if (cmd.startsWith("SIM_LOAD ")) {
    String load = cmd.substring(9);
    load.trim();
    load.toUpperCase();

    if (load == "OFF") {
      simFanRequest = false;
      simLightRequest = false;
    } else if (load == "LAMP") {
      simFanRequest = false;
      simLightRequest = true;
    } else if (load == "FAN") {
      simFanRequest = true;
      simLightRequest = false;
    } else if (load == "BOTH") {
      simFanRequest = true;
      simLightRequest = true;
    } else {
      Serial.println("Usage: SIM_LOAD OFF | LAMP | FAN | BOTH");
      return;
    }

    simLoadOverride = true;
    updateLogic();

    // Make the normal non-blocking PZEM task read the new state immediately.
    lastPzemRead = millis() - PZEM_INTERVAL;

    Serial.printf("SIM load override: %s | fan=%s | lamp=%s\n",
                  load.c_str(),
                  simFanRequest ? "ON" : "OFF",
                  simLightRequest ? "ON" : "OFF");
    return;
  }
#endif

  if (cmd == "PRINT_CONFIG") {
    printProvisioningStatus();
    return;
  }

  if (cmd == "CLEAR_CONFIG") {
    clearProvisioning();
    return;
  }

  if (cmd.startsWith("SET_CONFIG ")) {
    int s1 = cmd.indexOf(' ');
    int s2 = cmd.indexOf(' ', s1 + 1);
    int s3 = cmd.indexOf(' ', s2 + 1);
    int s4 = cmd.indexOf(' ', s3 + 1);
    if (s1 > 0 && s2 > 0 && s3 > 0 && s4 > 0) {
      String pId = cmd.substring(s1 + 1, s2);
      String rId = cmd.substring(s2 + 1, s3);
      String email = cmd.substring(s3 + 1, s4);
      String pwd = cmd.substring(s4 + 1);
      email.trim();
      pwd.trim();

      if (!hasBasicEmailShape(email)) {
        Serial.println("Invalid device email. Use the full email returned by Admin -> Rooms.");
        Serial.println("Expected format: device+property_001+room_001@devices.ecostay.local");
        return;
      }

      if (pwd.length() == 0) {
        Serial.println("Invalid device password. Use the one-time password returned by Admin -> Rooms.");
        return;
      }

      preferences.putString("propertyId", pId);
      preferences.putString("roomId", rId);
      preferences.putString("deviceEmail", email);
      preferences.putString("devicePassword", pwd);
      Serial.println("Config and credentials saved. Rebooting...");
      delay(1000);
      ESP.restart();
    }
    Serial.println("Usage: SET_CONFIG <propertyId> <roomId> <deviceEmail> <devicePassword>");
  }
}

// ======================
// SETUP
// ======================
void setup() {
  Serial.begin(115200);
  delay(1000);

  loadProvisioning();

  basePath = "properties/" + propertyId + "/rooms/" + roomId;

  pathExhaust = basePath + "/devices/exhaustFan";
  pathMotion = basePath + "/devices/motionDetection";
  pathLights = basePath + "/devices/lights";
  pathPump = basePath + "/devices/waterPump";
  pathAirConditioner = basePath + "/devices/airConditioner";
  pathMainRelay = basePath + "/devices/mainRelay";

  printProvisioningStatus();

  pinMode(ledPin, OUTPUT);
  pinMode(extLedPin, OUTPUT);
  digitalWrite(ledPin, LOW);
  digitalWrite(extLedPin, LOW);

  pinMode(flowPin, INPUT);
  attachInterrupt(digitalPinToInterrupt(flowPin), pulseCounter, RISING);

  pinMode(WATER_SENSOR_PIN, INPUT);

  pinMode(GAS_SENSOR_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(RELAY_EXHAUST_FAN, OUTPUT);
  pinMode(RELAY_PRESENCE, OUTPUT);
  pinMode(RELAY_LIGHTS, OUTPUT);
  pinMode(RELAY_PUMP, OUTPUT);
  pinMode(RELAY_AIR_CONDITIONER, OUTPUT);
  applyRelays();

  pinMode(DOOR_SWITCH_PIN, INPUT_PULLUP);  // GPIO33 floats without this -> reed chatters, vacancy never confirms
  pinMode(PIR_PIN, INPUT);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  pinMode(DHTPIN, INPUT_PULLUP);
  dht.begin();
  Serial.print(DHT_SENSOR_NAME);
  Serial.println(" Sensor Started");

#if ECOSTAY_WOKWI_SIMULATION
  Serial.println("Wokwi mode enabled: PZEM UART GPIO18/19; fan GPIO26; lamp GPIO13; AC GPIO21.");
  Serial.println("Use SIM_LOAD OFF/LAMP/FAN/BOTH, or SIM_AUTO for Firebase control.");
  Serial.println("Use SIM_CMD_LOAD OFF/LAMP/FAN/BOTH to test Firebase load policy.");
  Serial.println("Use SIM_CMD_AC 0|1 to test the separate AC command and relay.");
  Serial.println(
    "Use SIM_SCENARIO LIST, then START [name|index], for an occupancy timeline."
  );
#endif

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 20000) {
    wifiConnectingBlink();
    Serial.print(".");
    delay(100);
  }

  wifiConnected = (WiFi.status() == WL_CONNECTED);
  Serial.println(wifiConnected ? "\nWiFi Connected" : "\nWiFi Failed");

  if (wifiConnected) {
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  }

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;

  if (deviceEmail.length() > 0 && devicePassword.length() > 0 && hasBasicEmailShape(deviceEmail)) {
    if (deviceEmail != expectedDeviceEmail()) {
      Serial.println("WARNING: Device email does not match this property/room.");
      Serial.println("Auth may succeed, but RTDB rules will deny writes if the custom claims differ.");
    }
    auth.user.email = deviceEmail.c_str();
    auth.user.password = devicePassword.c_str();
    signupOK = true;
    Serial.println("Using device credentials for Firebase Auth.");
  } else if (deviceEmail.length() > 0 && !hasBasicEmailShape(deviceEmail)) {
    Serial.println("Invalid saved device email; staying offline.");
    Serial.println("Run CLEAR_CONFIG, then SET_CONFIG with the full Admin -> Rooms device email.");
    signupOK = false;
  } else {
    Serial.println("Unprovisioned: Missing credentials, staying offline");
    signupOK = false;
  }

  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("Smart Hotel System Ready");
}

// ======================
// LOOP
// ======================
void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    handleSerialCommand(cmd);
  }

#if ECOSTAY_WOKWI_SIMULATION
  updateSimulationScenario();
#endif

  updateFlowReading();
  updateWaterReading();
  updateGasReading();
  updateDHTReading();
  updateDistanceReading();
  updateDoorReading();
  updatePIRReading();
  updateOccupancyState();

#if ECOSTAY_WOKWI_SIMULATION
  // Transcript after the existing state machine has evaluated the new inputs.
  flushSimulationScenarioTranscript();
#endif

  updatePzemReading();

  readDeviceCommands();
  updateLogic();
  uploadLatestTelemetry();

  if (!wifiConnected) {
    wifiConnectingBlink();
  } else if (Firebase.ready() && signupOK) {
    wifiConnectedBreathing();
  }

  systemHeartbeat();
  delay(50);
}
