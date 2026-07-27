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
        { doorOpen: true, waterLevel: 64 },
        { lights: true, exhaustFan: true, waterPump: true },
        true,
      ),
    ).toMatchObject({
      doorOpen: true,
      lightsOn: true,
      fanOn: true,
      pumpOn: true,
      waterLevel: 64,
      online: true,
    });
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
      fanOn: false,
      fanForcedByGas: false,
      pumpOn: false,
      gasAlarm: false,
      waterLevel: 100,
      online: false,
    });
  });
});
