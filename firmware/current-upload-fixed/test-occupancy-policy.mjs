import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sketchPath = new URL("./current-upload-fixed.ino", import.meta.url);
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

console.log("Occupancy vacancy policy regression checks passed.");
