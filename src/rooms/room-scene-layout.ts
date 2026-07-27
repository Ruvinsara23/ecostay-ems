import type { OccupantPose } from './room-scene-state';

export type OccupantPlacement = {
  position: readonly [number, number, number];
  rotationY: number;
  rotationZ: number;
  scale: number;
};

export const OCCUPANT_PLACEMENTS: Record<
  Exclude<OccupantPose, 'absent'>,
  OccupantPlacement
> = {
  entering: {
    position: [-3.05, 0, 2.45],
    rotationY: -0.35,
    rotationZ: 0,
    scale: 0.82,
  },
  active: {
    position: [-1.55, 0, 1.35],
    rotationY: -0.2,
    rotationZ: 0,
    scale: 0.82,
  },
  idle: {
    position: [-2.2, 0, 1.15],
    rotationY: 0.2,
    rotationZ: 0,
    scale: 0.78,
  },
  sleeping: {
    position: [2.65, 0.92, -1.05],
    rotationY: -0.25,
    rotationZ: -Math.PI / 2,
    scale: 0.78,
  },
  exiting: {
    position: [-3.75, 0, 2.55],
    rotationY: 2.75,
    rotationZ: 0,
    scale: 0.82,
  },
};

type SolidFootprint = {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

const WALKING_ROUTE_SOLIDS: SolidFootprint[] = [
  { id: 'shower', minX: -4.55, maxX: -2.95, minZ: -3.48, maxZ: -1.92 },
  { id: 'bathroom-divider', minX: -4.83, maxX: -0.27, minZ: -1.68, maxZ: -1.42 },
  { id: 'bathroom-side-wall', minX: -0.35, maxX: -0.09, minZ: -3.97, maxZ: -1.47 },
  { id: 'tv-divider', minX: -0.3, maxX: 0.3, minZ: -0.9, maxZ: 1.75 },
  { id: 'wardrobe', minX: -4.72, maxX: -3.58, minZ: 0.05, maxZ: 2 },
  { id: 'left-armchair', minX: -2.35, maxX: -0.95, minZ: 2.45, maxZ: 3.85 },
  { id: 'right-armchair', minX: -1.15, maxX: 0.25, minZ: 1.9, maxZ: 3.3 },
  { id: 'coffee-table', minX: -0.63, maxX: 0.73, minZ: 1.65, maxZ: 2.45 },
  { id: 'sofa', minX: 0.67, maxX: 3.23, minZ: 2.25, maxZ: 3.55 },
  { id: 'bed', minX: 1.02, maxX: 4.28, minZ: -2.32, maxZ: 0.22 },
  { id: 'bath', minX: -2.6, maxX: -0.4, minZ: -2.43, maxZ: -1.53 },
  { id: 'vanity', minX: -2.6, maxX: -0.4, minZ: -3.82, maxZ: -3.08 },
];

const OCCUPANT_RADIUS = 0.34;

export function collidingSolidForWalkingPose(
  pose: 'entering' | 'active' | 'idle' | 'exiting',
): string | null {
  const [x, , z] = OCCUPANT_PLACEMENTS[pose].position;
  const solid = WALKING_ROUTE_SOLIDS.find(
    ({ minX, maxX, minZ, maxZ }) =>
      x + OCCUPANT_RADIUS > minX &&
      x - OCCUPANT_RADIUS < maxX &&
      z + OCCUPANT_RADIUS > minZ &&
      z - OCCUPANT_RADIUS < maxZ,
  );
  return solid?.id ?? null;
}
