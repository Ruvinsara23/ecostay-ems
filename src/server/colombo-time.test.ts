import { describe, expect, it } from 'vitest';
import { COLOMBO_OFFSET_MS, colomboTouWindow } from './colombo-time';

// CEB TOU windows (Colombo wall clock, UTC+5:30, no DST):
//   day 05:30–18:30 · peak 18:30–22:30 · off-peak 22:30–05:30 (wraps midnight).
// Source: docs/research/ceb-tariff-schedule.md (PUCSL decision, eff. 11 May 2026).
// Helper: a Colombo wall-clock instant on 2026-07-09, expressed in UTC ms.
const colombo = (h: number, m: number) => Date.UTC(2026, 6, 9, h, m) - COLOMBO_OFFSET_MS;

describe('colomboTouWindow — CEB TOU window classification', () => {
  it('day opens at exactly 05:30', () => {
    expect(colomboTouWindow(colombo(5, 29))).toBe('offPeak');
    expect(colomboTouWindow(colombo(5, 30))).toBe('day');
  });

  it('peak opens at exactly 18:30', () => {
    expect(colomboTouWindow(colombo(18, 29))).toBe('day');
    expect(colomboTouWindow(colombo(18, 30))).toBe('peak');
  });

  it('off-peak opens at exactly 22:30', () => {
    expect(colomboTouWindow(colombo(22, 29))).toBe('peak');
    expect(colomboTouWindow(colombo(22, 30))).toBe('offPeak');
  });

  it('off-peak wraps midnight without a gap', () => {
    expect(colomboTouWindow(colombo(23, 59))).toBe('offPeak');
    expect(colomboTouWindow(colombo(0, 0))).toBe('offPeak');
    expect(colomboTouWindow(colombo(3, 0))).toBe('offPeak');
  });

  it('midday is day', () => {
    expect(colomboTouWindow(colombo(12, 0))).toBe('day');
  });
});
