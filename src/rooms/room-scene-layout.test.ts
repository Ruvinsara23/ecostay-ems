import { describe, expect, it } from 'vitest';
import { collidingSolidForWalkingPose } from './room-scene-layout';

describe('3D room occupant route', () => {
  it.each(['entering', 'active', 'idle', 'exiting'] as const)(
    'keeps the %s placement clear of walls and furniture',
    (pose) => {
      expect(collidingSolidForWalkingPose(pose)).toBeNull();
    },
  );
});
