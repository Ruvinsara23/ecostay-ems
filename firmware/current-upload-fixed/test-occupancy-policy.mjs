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
  "OCCUPIED_SLEEPING",
  "EXIT_PENDING",
]) {
  assert.match(
    comfortLoadFunction,
    new RegExp(confirmedState),
    `${confirmedState} must continue to allow requested comfort loads.`,
  );
}
assert.match(
  sketch,
  /bool occupancyAllowsComfortLoads = comfortLoadsAllowed\(occupancyState\);/,
  "Relay gating must use the confirmed-presence comfort-load policy.",
);

console.log("Occupancy vacancy policy regression checks passed.");
