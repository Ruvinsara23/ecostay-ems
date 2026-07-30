import { describe, expect, it } from 'vitest';
import { deriveRoomSceneState } from './room-scene-state';

describe('deriveRoomSceneState', () => {
  it.each([
    ['VACANT', 'absent'],
    ['VACANT_CONFIRMED', 'absent'],
    ['ENTRY_DETECTED', 'entering'],
    ['OCCUPIED_ACTIVE', 'active'],
    ['OCCUPIED_IDLE', 'idle'],
    ['OCCUPIED_SLEEPING', 'sleeping'],
    ['EXIT_PENDING', 'exiting'],
  ] as const)('maps %s to the %s occupant pose', (occupancyState, occupantPose) => {
    expect(
      deriveRoomSceneState({ occupancyState }, {}, true).occupantPose,
    ).toBe(occupantPose);
  });

  it('maps the door, device commands, water level, and online state', () => {
    expect(
      deriveRoomSceneState(
        { occupancyState: 'OCCUPIED_ACTIVE', doorOpen: true, waterLevel: 64 },
        { lights: true, exhaustFan: true, waterPump: true, airConditioner: true },
        true,
      ),
    ).toMatchObject({
      doorOpen: true,
      lightsOn: true,
      fanOn: true,
      pumpOn: true,
      acOn: true,
      waterLevel: 64,
      online: true,
    });
  });

  it.each([
    'VACANT',
    'ENTRY_DETECTED',
    'EXIT_PENDING',
    'VACANT_CONFIRMED',
  ] as const)('blocks comfort-load visuals in %s while leaving the pump independent', (occupancyState) => {
    expect(
      deriveRoomSceneState(
        { occupancyState, gas: 250 },
        { lights: true, exhaustFan: true, waterPump: true, airConditioner: true },
        true,
      ),
    ).toMatchObject({
      lightsOn: false,
      fanOn: false,
      acOn: false,
      pumpOn: true,
    });
  });

  it('keeps commanded AC on while sleeping and blocks lights and fan', () => {
    expect(
      deriveRoomSceneState(
        { occupancyState: 'OCCUPIED_SLEEPING', gas: 250 },
        { lights: true, exhaustFan: true, waterPump: true, airConditioner: true },
        true,
      ),
    ).toMatchObject({
      lightsOn: false,
      fanOn: false,
      acOn: true,
      pumpOn: true,
    });
  });

  it('turns the visual TV on only while the firmware reports human presence', () => {
    expect(
      deriveRoomSceneState({ humanPresent: true }, {}, true).tvPresenceCueOn,
    ).toBe(true);
    expect(
      deriveRoomSceneState({ humanPresent: false }, {}, true).tvPresenceCueOn,
    ).toBe(false);
    expect(
      deriveRoomSceneState({ humanPresent: true }, {}, false).tvPresenceCueOn,
    ).toBe(false);
  });

  it('shows the firmware gas override even when the fan command is off', () => {
    expect(
      deriveRoomSceneState({ gas: 301 }, { exhaustFan: false }, true),
    ).toMatchObject({
      gasAlarm: true,
      fanOn: true,
      fanForcedByGas: true,
    });
  });

  it('keeps the fan in forced mode during a gas alarm even when commanded on', () => {
    expect(
      deriveRoomSceneState({ gas: 301 }, { exhaustFan: true }, true),
    ).toMatchObject({
      gasAlarm: true,
      fanOn: true,
      fanForcedByGas: true,
    });
  });

  it('uses safe visual defaults for missing or malformed realtime fields', () => {
    expect(
      deriveRoomSceneState({ occupancyState: 'UNKNOWN' as never, waterLevel: 140 }, {}, false),
    ).toEqual({
      doorOpen: false,
      occupantPose: 'absent',
      lightsOn: false,
      tvPresenceCueOn: false,
      fanOn: false,
      fanForcedByGas: false,
      pumpOn: false,
      acOn: false,
      gasAlarm: false,
      waterLevel: 100,
      online: false,
    });
  });
});
