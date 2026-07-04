import { describe, expect, it } from 'vitest';
import { deviceFreshness } from './device-freshness';

// nowMs is the SERVER-corrected clock (local Date.now() + .info/serverTimeOffset).
// Field evidence (issue 04): the dev machine's clock was ~25 min off server time,
// so naive Date.now() comparisons are wrong in the real world, not hypothetically.
const NOW = 2_000_000_000_000;

describe('deviceFreshness', () => {
  it('is online for a snapshot fresher than the threshold', () => {
    expect(deviceFreshness(NOW - 3_000, NOW)).toEqual({ online: true, ageSeconds: 3 });
  });

  it('is still online at exactly 15 s (threshold is exclusive)', () => {
    expect(deviceFreshness(NOW - 15_000, NOW)).toEqual({ online: true, ageSeconds: 15 });
  });

  it('is offline past 15 s of silence', () => {
    expect(deviceFreshness(NOW - 15_001, NOW)).toEqual({ online: false, ageSeconds: 15 });
  });

  it('reports minutes-old silence with the right age', () => {
    expect(deviceFreshness(NOW - 90_000, NOW)).toEqual({ online: false, ageSeconds: 90 });
  });

  it('clamps a slightly-future timestamp to age 0 (write raced the clock read)', () => {
    expect(deviceFreshness(NOW + 2_000, NOW)).toEqual({ online: true, ageSeconds: 0 });
  });

  it('goes offline for a device that died, even when the local clock runs far behind server time', () => {
    // Local clock 1528 s slow (the measured skew). Corrected now = local + offset.
    const localNow = NOW - 1_528_000;
    const offsetMs = 1_528_000;
    const correctedNow = localNow + offsetMs;
    const updatedAt = NOW - 128_000; // device last wrote 128 s ago in server time
    // Naive local comparison would clamp to "future" → online. Corrected must say offline.
    expect(deviceFreshness(updatedAt, correctedNow)).toEqual({
      online: false,
      ageSeconds: 128,
    });
  });

  it('treats a missing updatedAt as offline with unknown age', () => {
    expect(deviceFreshness(undefined, NOW)).toEqual({ online: false, ageSeconds: null });
  });

  it('honors a custom threshold', () => {
    expect(deviceFreshness(NOW - 20_000, NOW, 30_000).online).toBe(true);
  });
});
