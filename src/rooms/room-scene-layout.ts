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
    position: [-5.2, 0, 4.25],
    rotationY: -0.2,
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

type OccupantPosition = readonly [number, number, number];

const OCCUPANT_ENTRY_ROUTE: readonly OccupantPosition[] = [
  OCCUPANT_PLACEMENTS.entering.position,
  [-5.2, 0, 2.45],
  [-4.55, 0, 2.45],
  [-3.15, 0, 2.45],
  [-2.85, 0, 1.55],
  OCCUPANT_PLACEMENTS.active.position,
];

const ENTRY_ROUTE_SEGMENT_LENGTHS = OCCUPANT_ENTRY_ROUTE.slice(1).map(
  (point, index) => {
    const previous = OCCUPANT_ENTRY_ROUTE[index];
    return Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    );
  },
);
const ENTRY_ROUTE_LENGTH = ENTRY_ROUTE_SEGMENT_LENGTHS.reduce(
  (total, length) => total + length,
  0,
);

export function entryRoutePosition(progress: number): OccupantPosition {
  const boundedProgress = Math.min(1, Math.max(0, progress));
  if (boundedProgress === 0) return OCCUPANT_ENTRY_ROUTE[0];
  if (boundedProgress === 1) return OCCUPANT_ENTRY_ROUTE.at(-1)!;

  let remainingDistance = boundedProgress * ENTRY_ROUTE_LENGTH;
  for (let index = 0; index < ENTRY_ROUTE_SEGMENT_LENGTHS.length; index += 1) {
    const segmentLength = ENTRY_ROUTE_SEGMENT_LENGTHS[index];
    if (remainingDistance <= segmentLength) {
      const start = OCCUPANT_ENTRY_ROUTE[index];
      const end = OCCUPANT_ENTRY_ROUTE[index + 1];
      const segmentProgress = remainingDistance / segmentLength;
      return [
        start[0] + (end[0] - start[0]) * segmentProgress,
        start[1] + (end[1] - start[1]) * segmentProgress,
        start[2] + (end[2] - start[2]) * segmentProgress,
      ];
    }
    remainingDistance -= segmentLength;
  }

  return OCCUPANT_ENTRY_ROUTE.at(-1)!;
}

export function shouldAnimateEntry(
  previousPose: OccupantPose,
  nextPose: OccupantPose,
  initialized: boolean,
  reducedMotion: boolean,
): boolean {
  return (
    initialized &&
    !reducedMotion &&
    nextPose === 'active' &&
    (previousPose === 'absent' || previousPose === 'entering')
  );
}

export function collidingSolidAtPosition(
  [x, , z]: OccupantPosition,
): string | null {
  const solid = WALKING_ROUTE_SOLIDS.find(
    ({ minX, maxX, minZ, maxZ }) =>
      x + OCCUPANT_RADIUS > minX &&
      x - OCCUPANT_RADIUS < maxX &&
      z + OCCUPANT_RADIUS > minZ &&
      z - OCCUPANT_RADIUS < maxZ,
  );
  return solid?.id ?? null;
}

export function collidingSolidForWalkingPose(
  pose: 'entering' | 'active' | 'idle' | 'exiting',
): string | null {
  return collidingSolidAtPosition(OCCUPANT_PLACEMENTS[pose].position);
}
