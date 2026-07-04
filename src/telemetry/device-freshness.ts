/** The "Device online" derived term (CONTEXT.md): offline when now − updatedAt > 15 s. */
export const FRESHNESS_THRESHOLD_MS = 15_000;

export type Freshness = {
  online: boolean;
  /** Whole seconds since the last write; null when the snapshot carries no updatedAt. */
  ageSeconds: number | null;
};

/**
 * nowMs MUST be the server-corrected clock (local time + .info/serverTimeOffset) —
 * real dev-machine skew of ~25 min was measured during the Stage A smoke test, so a
 * naive Date.now() here silently breaks offline detection (issue 04 field evidence).
 * Future timestamps clamp to age 0: a server write can race a slightly-stale clock read.
 */
export function deviceFreshness(
  updatedAt: number | undefined,
  nowMs: number,
  thresholdMs: number = FRESHNESS_THRESHOLD_MS,
): Freshness {
  if (updatedAt === undefined) {
    return { online: false, ageSeconds: null };
  }
  const ageMs = Math.max(0, nowMs - updatedAt);
  return { online: ageMs <= thresholdMs, ageSeconds: Math.floor(ageMs / 1000) };
}
