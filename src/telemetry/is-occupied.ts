import type { OccupancyState } from './contract';

const OCCUPIED_STATES: ReadonlySet<OccupancyState> = new Set([
  'ENTRY_DETECTED',
  'OCCUPIED_ACTIVE',
  'OCCUPIED_IDLE',
  'OCCUPIED_SLEEPING',
  'EXIT_PENDING',
]);

/**
 * The "Occupied" derived term (CONTEXT.md) — the exact predicate the firmware's
 * isOccupiedState() uses. The dashboard never re-derives occupancy any other way.
 */
export function isOccupied(state: OccupancyState): boolean {
  return OCCUPIED_STATES.has(state);
}
