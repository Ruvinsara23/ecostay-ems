import type { DeviceCommands, OccupancyState } from '@/telemetry/contract';
import { GAS_ALARM_THRESHOLD, OCCUPANCY_STATES } from '@/telemetry/contract';
import type { RoomLatest } from './room-data-source';

export type OccupantPose =
  | 'absent'
  | 'entering'
  | 'active'
  | 'idle'
  | 'sleeping'
  | 'exiting';

export type RoomSceneState = {
  doorOpen: boolean;
  occupantPose: OccupantPose;
  lightsOn: boolean;
  /** Presence visualization only; the firmware has no TV command/relay. */
  tvPresenceCueOn: boolean;
  fanOn: boolean;
  fanForcedByGas: boolean;
  acOn: boolean;
  pumpOn: boolean;
  gasAlarm: boolean;
  waterLevel: number;
  online: boolean;
};

const OCCUPANT_POSE: Record<OccupancyState, OccupantPose> = {
  VACANT: 'absent',
  ENTRY_DETECTED: 'entering',
  OCCUPIED_ACTIVE: 'active',
  OCCUPIED_IDLE: 'idle',
  OCCUPIED_SLEEPING: 'sleeping',
  EXIT_PENDING: 'exiting',
  VACANT_CONFIRMED: 'absent',
};

function occupantPose(state: RoomLatest['occupancyState']): OccupantPose {
  if (!OCCUPANCY_STATES.includes(state as OccupancyState)) return 'absent';
  return OCCUPANT_POSE[state as OccupancyState];
}

function boundedPercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Converts contract-exact realtime values into renderer state. Lights, fan, and
 * pump are commanded states because the firmware does not report their actual
 * relay outputs. The gas alarm is the one exception: firmware forces the fan on.
 */
export function deriveRoomSceneState(
  latest: RoomLatest,
  commands: DeviceCommands,
  online: boolean,
): RoomSceneState {
  const gasAlarm = latest.gas !== undefined && latest.gas > GAS_ALARM_THRESHOLD;
  const fanCommandedOn = commands.exhaustFan === true;

  return {
    doorOpen: latest.doorOpen === true,
    occupantPose: occupantPose(latest.occupancyState),
    lightsOn: commands.lights === true,
    tvPresenceCueOn: online && latest.humanPresent === true,
    fanOn: fanCommandedOn || gasAlarm,
    fanForcedByGas: gasAlarm,
    acOn: commands.airConditioner === true,
    pumpOn: commands.waterPump === true,
    gasAlarm,
    waterLevel: boundedPercent(latest.waterLevel),
    online,
  };
}
