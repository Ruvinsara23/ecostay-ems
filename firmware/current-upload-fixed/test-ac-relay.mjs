import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('./current-upload-fixed.ino', import.meta.url),
  'utf8',
);

assert.match(source, /#define RELAY_AIR_CONDITIONER\s+21\b/);
assert.match(
  source,
  /pathAirConditioner\s*=\s*basePath\s*\+\s*"\/devices\/airConditioner"/,
);
assert.match(
  source,
  /cmdAirConditioner\s*=\s*fbReadBool\(pathAirConditioner\.c_str\(\),\s*cmdAirConditioner\)/,
);
assert.match(
  source,
  /relayAirConditioner\s*=\s*occupancyAllowsComfortLoads\s*&&\s*cmdAirConditioner/,
);
assert.match(
  source,
  /writeRelay\(RELAY_AIR_CONDITIONER,\s*relayAirConditioner\)/,
);
assert.match(source, /SIM_CMD_AC 0\|1/);

console.log('AC relay firmware contract passed');
