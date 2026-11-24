import { shiftDate } from './journal.mjs?v=suivi-2';

const WINDOW_DAYS = 14;

export function weightTrend(days, today) {
  let latestCount = 0;
  let previousCount = 0;
  let latestTotal = 0;
  let previousTotal = 0;

  for (let offset = 0; offset < 2 * WINDOW_DAYS; offset += 1) {
    const date = shiftDate(today, -offset);
    if (!date) return null;
    const weight = days?.[date]?.weight;
    if (!Number.isFinite(weight) || weight <= 0) continue;

    if (offset < WINDOW_DAYS) {
      latestTotal += weight;
      latestCount += 1;
    } else {
      previousTotal += weight;
      previousCount += 1;
    }
  }

  if (latestCount < 2 || previousCount < 2) return null;
  const latestAverage = latestTotal / latestCount;
  const previousAverage = previousTotal / previousCount;
  return { delta: latestAverage - previousAverage, latestAverage, previousAverage, latestCount, previousCount };
}
