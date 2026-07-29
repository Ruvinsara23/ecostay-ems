import type { DeviceCommandKey, OccupancyState } from './contract';

export const COMFORT_LOAD_COMMAND_KEYS = [
  'lights',
  'exhaustFan',
  'airConditioner',
] as const satisfies readonly DeviceCommandKey[];

export type ComfortLoadCommandKey = (typeof COMFORT_LOAD_COMMAND_KEYS)[number];

export function comfortLoadsAllowed(state: OccupancyState | undefined): boolean {
  return state === 'OCCUPIED_ACTIVE' || state === 'OCCUPIED_IDLE';
}

export function isComfortLoadCommand(key: DeviceCommandKey): key is ComfortLoadCommandKey {
  return COMFORT_LOAD_COMMAND_KEYS.some((comfortKey) => comfortKey === key);
}

export function comfortLoadCommandBlocked(
  state: OccupancyState | undefined,
  key: DeviceCommandKey,
): boolean {
  return isComfortLoadCommand(key) && !comfortLoadsAllowed(state);
}
