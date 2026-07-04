import { describe, expect, it } from 'vitest';
import { isOccupied } from './is-occupied';
import type { OccupancyState } from './contract';

// Expected values come from the firmware's isOccupiedState() as documented in
// docs/firmware-contract.md and CONTEXT.md — the dashboard must match it exactly.
const EXPECTED: Array<[OccupancyState, boolean]> = [
  ['VACANT', false],
  ['ENTRY_DETECTED', true],
  ['OCCUPIED_ACTIVE', true],
  ['OCCUPIED_IDLE', true],
  ['OCCUPIED_SLEEPING', true],
  ['EXIT_PENDING', true],
  ['VACANT_CONFIRMED', false],
];

describe('isOccupied', () => {
  it.each(EXPECTED)('%s → %s', (state, expected) => {
    expect(isOccupied(state)).toBe(expected);
  });
});
