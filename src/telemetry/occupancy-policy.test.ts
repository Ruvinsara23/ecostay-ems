import { describe, expect, it } from 'vitest';
import { OCCUPANCY_STATES } from './contract';
import {
  COMFORT_LOAD_COMMAND_KEYS,
  comfortLoadCommandAllowed,
  comfortLoadCommandBlocked,
  comfortLoadsAllowed,
} from './occupancy-policy';

describe('occupancy comfort-load policy', () => {
  it('allows comfort loads only during active and idle occupancy', () => {
    expect(
      OCCUPANCY_STATES.filter((state) => comfortLoadsAllowed(state)),
    ).toEqual(['OCCUPIED_ACTIVE', 'OCCUPIED_IDLE']);
  });

  it('blocks all comfort commands but never the pump in every disallowed state', () => {
    const disallowedStates = OCCUPANCY_STATES.filter(
      (state) => state !== 'OCCUPIED_SLEEPING' && !comfortLoadsAllowed(state),
    );

    for (const state of disallowedStates) {
      for (const key of COMFORT_LOAD_COMMAND_KEYS) {
        expect(comfortLoadCommandBlocked(state, key)).toBe(true);
      }
      expect(comfortLoadCommandBlocked(state, 'waterPump')).toBe(false);
    }
  });

  it('keeps only AC allowed while the guest is sleeping', () => {
    expect(comfortLoadCommandAllowed('OCCUPIED_SLEEPING', 'lights')).toBe(false);
    expect(comfortLoadCommandAllowed('OCCUPIED_SLEEPING', 'exhaustFan')).toBe(false);
    expect(comfortLoadCommandAllowed('OCCUPIED_SLEEPING', 'airConditioner')).toBe(true);
    expect(comfortLoadCommandBlocked('OCCUPIED_SLEEPING', 'airConditioner')).toBe(false);
  });
});
