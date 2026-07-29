import { describe, expect, it } from 'vitest';
import {
  OCCUPANT_PLACEMENTS,
  collidingSolidAtPosition,
  collidingSolidForWalkingPose,
  entryRoutePosition,
  shouldAnimateEntry,
} from './room-scene-layout';

describe('3D room occupant route', () => {
  it('places ENTRY_DETECTED outside the room while presence is still clear', () => {
    expect(OCCUPANT_PLACEMENTS.entering.position[0]).toBeLessThan(-4.9);
  });

  it('moves through the doorway from the outside anchor to the active anchor', () => {
    expect(entryRoutePosition(0)).toEqual(OCCUPANT_PLACEMENTS.entering.position);
    expect(entryRoutePosition(1)).toEqual(OCCUPANT_PLACEMENTS.active.position);

    const sampledRoute = Array.from({ length: 101 }, (_, index) =>
      entryRoutePosition(index / 100),
    );
    expect(
      sampledRoute.every((position) => collidingSolidAtPosition(position) === null),
    ).toBe(true);

    const threshold = sampledRoute.find(([x]) => x >= -4.95 && x <= -4.75);
    expect(threshold).toBeDefined();
    expect(threshold?.[2]).toBeGreaterThan(1.4);
    expect(threshold?.[2]).toBeLessThan(2.9);
  });

  it('animates a newly observed arrival without replaying entry on page load', () => {
    expect(shouldAnimateEntry('absent', 'active', false, false)).toBe(false);
    expect(shouldAnimateEntry('absent', 'active', true, false)).toBe(true);
    expect(shouldAnimateEntry('entering', 'active', true, false)).toBe(true);
    expect(shouldAnimateEntry('idle', 'active', true, false)).toBe(false);
    expect(shouldAnimateEntry('entering', 'active', true, true)).toBe(false);
  });

  it.each(['entering', 'active', 'idle', 'exiting'] as const)(
    'keeps the %s placement clear of walls and furniture',
    (pose) => {
      expect(collidingSolidForWalkingPose(pose)).toBeNull();
    },
  );
});
