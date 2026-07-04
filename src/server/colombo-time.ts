/** Sri Lanka runs UTC+5:30 with no DST — fixed-offset math is exact here. */
export const COLOMBO_OFFSET_MS = 19_800_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The Colombo calendar date ('yyyy-mm-dd') of an instant. */
export function colomboDateKey(ms: number): string {
  const shifted = new Date(ms + COLOMBO_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The [00:00, 24:00) Colombo window of a date key, in UTC ms. */
export function colomboDayWindow(dateKey: string): { startMs: number; endMs: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  const startMs = Date.UTC(year, month - 1, day) - COLOMBO_OFFSET_MS;
  return { startMs, endMs: startMs + 86_400_000 };
}

/** The just-finished Colombo day — what the nightly rollup aggregates. */
export function colomboYesterdayKey(nowMs: number): string {
  return colomboDateKey(nowMs - 86_400_000);
}
