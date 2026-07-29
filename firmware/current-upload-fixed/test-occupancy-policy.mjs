import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const flashCandidatePath = new URL("./current-upload-fixed.ino", import.meta.url);
const sketchPath = existsSync(flashCandidatePath)
  ? flashCandidatePath
  : new URL("./sketch.ino", import.meta.url);
const sketch = readFileSync(sketchPath, "utf8");

assert.match(
  sketch,
  /#include "occupancy-policy\.h"/,
  "The sketch must use the production vacancy policy helper.",
);
assert.match(
  sketch,
  /VacancyClearTimer vacancyClearTimer = \{false, 0\};/,
  "The firmware must keep a dedicated vacancy clear timer.",
);
assert.match(
  sketch,
  /evaluateVacancyClearWindow\([\s\S]*?vacancyPhase,[\s\S]*?doorOpen,[\s\S]*?humanDetected,/,
  "The vacancy helper must receive the door and combined presence state.",
);
assert.match(
  sketch,
  /bool newHumanDetected = \(currentDistance <= 50\.0f\) \|\| pirDetected;/,
  "Either ultrasonic presence or PIR motion must block/reset vacancy.",
);
const occupancyFunction = sketch.match(
  /void updateOccupancyState\(\) \{[\s\S]*?\n\}/,
)?.[0];

assert.ok(occupancyFunction, "Could not locate updateOccupancyState().");
assert.doesNotMatch(
  occupancyFunction,
  /secondsSinceDoor\s*>\s*(10|30)/,
  "Door-close age alone must never confirm vacancy.",
);

const comfortLoadFunction = sketch.match(
  /bool comfortLoadsAllowed\(const String &state\) \{[\s\S]*?\n\}/,
)?.[0];

assert.ok(comfortLoadFunction, "Could not locate comfortLoadsAllowed().");
assert.doesNotMatch(
  comfortLoadFunction,
  /ENTRY_DETECTED/,
  "Door-open entry detection alone must not energize comfort loads.",
);
for (const confirmedState of [
  "OCCUPIED_ACTIVE",
  "OCCUPIED_IDLE",
]) {
  assert.match(
    comfortLoadFunction,
    new RegExp(confirmedState),
    `${confirmedState} must continue to allow requested comfort loads.`,
  );
}
for (const cutoffState of [
  "ENTRY_DETECTED",
  "OCCUPIED_SLEEPING",
  "EXIT_PENDING",
  "VACANT",
  "VACANT_CONFIRMED",
]) {
  assert.doesNotMatch(
    comfortLoadFunction,
    new RegExp(cutoffState),
    `${cutoffState} must cut requested comfort loads off.`,
  );
}
assert.match(
  sketch,
  /bool occupancyAllowsComfortLoads = comfortLoadsAllowed\(occupancyState\);/,
  "Relay gating must use the confirmed-presence comfort-load policy.",
);
assert.match(
  sketch,
  /clearBlockedComfortCommandsPreservingSleepIntent\(\s*occupancyAllowsComfortLoads,\s*occupancyState\s*\);/,
  "The firmware command policy must receive the current occupancy state.",
);
assert.match(
  sketch,
  /void clearBlockedComfortCommandsPreservingSleepIntent\([\s\S]*?if \(allowed \|\| state == "OCCUPIED_SLEEPING"\) \{\s*return;\s*\}/,
  "Sleeping must retain requested commands so active occupancy can resume them immediately.",
);
assert.doesNotMatch(
  sketch,
  /fbWriteBoolIfReady\([^,]+,\s*true\)/,
  "A device must never rely on an RTDB write-true permission to restore comfort commands.",
);

const shortScenario = sketch.match(
  /const SimScenarioEntry SIM_SCENARIO_SHORT\[\] = \{[\s\S]*?\n\};/,
)?.[0];
assert.ok(shortScenario, "Could not locate SIM_SCENARIO_SHORT.");
assert.match(
  shortScenario,
  /76000,\s*SIM_ACTION_SET_DISTANCE,\s*40\.0f/,
  "The short scenario must wake the sleeping guest with ultrasonic presence.",
);
assert.match(
  shortScenario,
  /78000,\s*SIM_ACTION_MARKER,\s*0\.0f,\s*"wake_active"/,
  "The short scenario must expose the active wake-up checkpoint.",
);
assert.match(
  shortScenario,
  /79000,\s*SIM_ACTION_SET_DISTANCE,\s*150\.0f/,
  "The short scenario must clear presence before its exit sequence.",
);

console.log("Occupancy vacancy policy regression checks passed.");
