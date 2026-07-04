#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"
#include <DHT.h>

// ======================
// WiFi Credentials
// ======================
#define WIFI_SSID "ESP32"
#define WIFI_PASSWORD "12345678"

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
String propertyId = "property_001";
String roomId = "room_001";
String basePath;

// ======================
// LED PINS
// ======================
const int ledPin = 2;
const int extLedPin = 23;

// ======================
// RELAY CONFIG
// ======================
#define RELAY_ACTIVE_LOW true

#define RELAY_EXHAUST_FAN 26 // Perpul wire = IN 3
#define RELAY_PRESENCE    14 // Gray = IN 4 
#define RELAY_LIGHTS      13 // green wire = IN 1 
#define RELAY_PUMP        5 // Yellow wire = IN 2

// ======================
// SENSOR PINS
// ======================
const int flowPin = 35;
#define WATER_SENSOR_PIN 34
#define GAS_SENSOR_PIN 32
const int BUZZER_PIN = 25;
#define DOOR_SWITCH_PIN 33
#define PIR_PIN 27
#define ULTRASONIC_TRIG_PIN 18
#define ULTRASONIC_ECHO_PIN 19
#define DHTPIN 4
#define DHTTYPE DHT11

// ======================
// Firebase paths
// ======================
#define PROPERTY_ID "property_001"
#define ROOM_ID "room_001"
#define ROOM_PATH "properties/" PROPERTY_ID "/rooms/" ROOM_ID

#define PATH_EXHAUST ROOM_PATH "/devices/exhaustFan"
#define PATH_MOTION ROOM_PATH "/devices/motionDetection"
#define PATH_LIGHTS ROOM_PATH "/devices/lights"
#define PATH_PUMP ROOM_PATH "/devices/waterPump"
#define PATH_MAIN_RELAY ROOM_PATH "/devices/mainRelay"

#define PATH_GAS ROOM_PATH "/latest/gas"
#define PATH_HUMAN ROOM_PATH "/latest/humanPresent"
#define PATH_MOTION_LATEST ROOM_PATH "/latest/motionDetected"
#define PATH_PIR ROOM_PATH "/latest/pir"

const float GAS_DETECTED_THRESHOLD = 500.0;

// ======================
// DHT11 SENSOR
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
int waterPercent = 0;
unsigned long lastWaterRead = 0;

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

// ======================
// PZEM DUMMY VALUES
// ======================
float pzemVoltage = 216.0f;
float pzemCurrent = 0.0f;
float pzemPower = 4.41f;
float pzemEnergy = 0.0f;
float targetVoltageV = 216.0f;
float targetPowerW = 4.41f;
unsigned long lastPzemRead = 0;

// ======================
// COMMAND / RUNTIME STATES
// ======================
bool cmdExhaust = false;
bool cmdMotionEnable = false;
bool cmdLights = false;
bool cmdPump = false;
bool cmdMainRelay = false;

bool relayFan = false;
bool relayPresence = false;
bool relayLight = false;
bool relayPump = false;
bool buzzerState = false;

// ======================
// TIMERS
// ======================
unsigned long lastFirebaseUpload = 0;
unsigned long lastCommandRead = 0;
unsigned long lastHeartbeat = 0;
unsigned long lastLEDUpdate = 0;
unsigned long firebaseBlinkTime = 0;

const unsigned long FLOW_INTERVAL = 1000;
const unsigned long WATER_INTERVAL = 1000;
const unsigned long GAS_INTERVAL = 1000;
const unsigned long FIREBASE_INTERVAL = 3000;
const unsigned long COMMAND_INTERVAL = 500;
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
  return state == "ENTRY_DETECTED" ||
         state == "OCCUPIED_ACTIVE" ||
         state == "OCCUPIED_IDLE" ||
         state == "OCCUPIED_SLEEPING" ||
         state == "EXIT_PENDING";
}

// ======================
// PZEM DUMMY TELEMETRY
// ======================
void updatePzemDummyReading() {
  if (millis() - lastPzemRead < 3000) {
    return;
  }

  lastPzemRead = millis();

  float smoothWave = (sin(millis() * 0.00012f) + 1.0f) * 0.5f;

  targetVoltageV = 216.0f + (smoothWave * 14.0f);
  targetPowerW = 4.41f + (smoothWave * 0.59f);

  pzemVoltage = targetVoltageV;
  pzemPower = targetPowerW;
  pzemCurrent = pzemPower / pzemVoltage;
  pzemEnergy += pzemPower * (3000.0f / 3600000.0f);

  Serial.print("PZEM Dummy -> V: ");
  Serial.print(pzemVoltage, 1);
  Serial.print(" V, I: ");
  Serial.print(pzemCurrent, 3);
  Serial.print(" A, P: ");
  Serial.print(pzemPower, 2);
  Serial.print(" W, E: ");
  Serial.print(pzemEnergy, 4);
  Serial.println(" kWh");
}

// ======================
// UPDATE DHT11 READING
// ======================
void updateDHTReading() {
  if (millis() - lastDHTRead >= DHT_INTERVAL) {
    lastDHTRead = millis();

    float newHumidity = dht.readHumidity();
    float newTemperature = dht.readTemperature();

    if (isnan(newHumidity) || isnan(newTemperature)) {
      Serial.println("DHT11 Read Failed");
      return;
    }

    humidity = newHumidity;
    temperature = newTemperature;

    Serial.print("Temperature: ");
    Serial.print(temperature);
    Serial.print(" C  Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");

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
    currentDistance = getDistance();

    if (currentDistance <= 200) {
      Serial.print("Distance: ");
      Serial.print(currentDistance);
      Serial.println(" cm");
    }
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

    int raw = analogRead(GAS_SENSOR_PIN);
    gasPpm = map(raw, 0, 4095, 0, 1000);
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
  int doorState = digitalRead(DOOR_SWITCH_PIN);
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
  int pirState = digitalRead(PIR_PIN);
  bool newPirDetected = (pirState == HIGH);

  if (pirState != lastPIRState) {
    if (pirState == 1) {
      Serial.println("MOTION DETECTED");
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
      Serial.print("HUMAN DETECTED - DIST: ");
      Serial.print(currentDistance);
      Serial.println(" cm");
      beep(200);
    } else {
      Serial.println("AREA CLEAR");
    }
    lastHumanDetected = newHumanDetected;
  }

  humanDetected = newHumanDetected;

  unsigned long now = millis();
  unsigned long secondsSinceMotion = (now - lastMotionAt) / 1000;
  unsigned long secondsSinceDoor = (now - lastDoorChangeAt) / 1000;

  if (occupancyState == "VACANT" || occupancyState == "VACANT_CONFIRMED") {
    if (doorOpen) {
      occupancyState = "ENTRY_DETECTED";
    } else if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    }
  } else if (occupancyState == "ENTRY_DETECTED") {
    if (humanDetected) {
      occupancyState = "OCCUPIED_ACTIVE";
    } else if (!doorOpen && secondsSinceDoor > 10) {
      occupancyState = "VACANT_CONFIRMED";
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
      } else if (secondsSinceDoor > 30) {
        occupancyState = "VACANT_CONFIRMED";
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

  cmdExhaust = fbReadBool(PATH_EXHAUST, cmdExhaust);
  cmdMotionEnable = fbReadBool(PATH_MOTION, cmdMotionEnable);
  cmdLights = fbReadBool(PATH_LIGHTS, cmdLights);
  cmdPump = fbReadBool(PATH_PUMP, cmdPump);
  cmdMainRelay = fbReadBool(PATH_MAIN_RELAY, true);
}

// ======================
// LOGIC ENGINE
// ======================
void updateLogic() {
  relayFan = gasAlarmActive ? true : cmdExhaust;
  relayLight = cmdLights;
  relayPump = cmdPump;

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
    payload.set("updatedAt/.sv", "timestamp");

    bool success = Firebase.RTDB.updateNode(&fbdo, basePath + "/latest", &payload);
    if (success) {
      Serial.println("Data uploaded to Firebase");
      Serial.printf("Temperature: %.1f C\n", temperature);
      Serial.printf("Humidity: %.1f %%\n", humidity);
      Serial.printf("Distance: %.1f cm\n", currentDistance);
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
        Serial.println("Flow history uploaded");
      }
    }
  } else {
    Serial.println("Firebase not ready");
  }
}

// ======================
// SETUP
// ======================
void setup() {
  Serial.begin(115200);
  delay(1000);

  basePath = "properties/" + propertyId + "/rooms/" + roomId;

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
  applyRelays();

  pinMode(DOOR_SWITCH_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  pinMode(DHTPIN, INPUT_PULLUP);
  dht.begin();
  Serial.println("DHT11 Sensor Started");

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

  if (Firebase.signUp(&config, &auth, "", "")) {
    signupOK = true;
    Serial.println("Firebase Signup OK");
  } else {
    Serial.printf("Firebase Signup Failed: %s\n", config.signer.signupError.message.c_str());
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
  updateFlowReading();
  updateWaterReading();
  updateGasReading();
  updateDHTReading();
  updateDistanceReading();
  updateDoorReading();
  updatePIRReading();
  updateOccupancyState();
  updatePzemDummyReading();

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