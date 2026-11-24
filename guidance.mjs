import { findCiqualFoodByCode } from './ciqual-search.mjs?v=suivi-2';
import { aggregateEntries, shiftDate } from './journal.mjs?v=suivi-2';

const WEEK_LENGTH = 7;
const CIQUAL_SOURCE = 'Ciqual 2025';
const METRICS = [
  { key: 'kcal', label: 'Énergie', unit: 'kcal' },
  { key: 'protein', label: 'Protéines', unit: 'g' },
  { key: 'fiber', label: 'Fibres', unit: 'g' },
];

const IDEAS = {
  protein: {
    title: 'Idées pour les protéines', minimumGap: 15,
    foods: [
      { code: 36018, grams: 100, label: '100 g de filet de poulet cuit' },
      { code: 20904, grams: 150, label: '150 g de tofu nature' },
    ],
  },
  fiber: {
    title: 'Idées pour les fibres', minimumGap: 5,
    foods: [
      { code: 20360, grams: 150, label: '150 g de lentilles cuites' },
      { code: 13015, grams: 100, label: '100 g de framboises' },
    ],
  },
};

function targetFor(targets, key) {
  return key === 'protein' ? targets?.proteinGoal ?? targets?.protein : targets?.[key];
}

function hasComparableValue(totals, key, target) {
  return Number.isFinite(target) && target > 0 && Number.isFinite(totals[key]) && totals.missing[key] === 0;
}

export function dayGuidance(entries, targets) {
  if (!targets || !entries.some(entry => entry.kind === 'meal')) return null;
  const totals = aggregateEntries(entries);
  const candidates = [];

  for (const key of ['protein', 'fiber']) {
    const target = targetFor(targets, key);
    if (!hasComparableValue(totals, key, target)) continue;
    const gap = target - totals[key];
    const minimumGap = totals.estimated ? 1.25 * IDEAS[key].minimumGap : IDEAS[key].minimumGap;
    if (gap >= minimumGap) candidates.push({ key, gap, relativeGap: gap / target });
  }

  if (!candidates.length) return null;
  const { key, gap } = candidates.sort((left, right) => right.relativeGap - left.relativeGap)[0];
  const { title, foods } = IDEAS[key];
  const nutrient = key === 'protein' ? 'protéines' : 'fibres';
  const options = [];

  for (const { code, grams, label } of foods) {
    const food = findCiqualFoodByCode(code);
    if (!Number.isFinite(food?.[key])) continue;
    const amount = Math.round(food[key] * grams / 100);
    options.push({ label, detail: `Environ ${amount} g de ${nutrient} · ${CIQUAL_SOURCE}`, code, grams, amount });
  }

  if (!options.length) return null;
  return {
    title,
    message: `D’après le journal, l’écart avec le repère est d’environ ${Math.round(gap)} g de ${nutrient}. Voici des idées pour un prochain repas.`,
    options,
  };
}

export function weeklyOverview(days, selectedDate) {
  const periodStart = shiftDate(selectedDate, -WEEK_LENGTH);
  const periodEnd = shiftDate(selectedDate, -1);
  if (!periodStart || !periodEnd) return null;

  let recordedDays = 0;
  let confirmedDays = 0;
  const metrics = METRICS.map(metric => ({ ...metric, days: 0, estimatedDays: 0, belowDays: 0, sum: 0, targetSum: 0 }));

  for (let offset = 1; offset <= WEEK_LENGTH; offset += 1) {
    const day = days?.[shiftDate(selectedDate, -offset)];
    if (!day?.entries?.length) continue;
    recordedDays += 1;
    if (day.complete !== true) continue;
    confirmedDays += 1;
    const totals = aggregateEntries(day.entries);

    for (const metric of metrics) {
      const target = targetFor(day.targets, metric.key);
      if (!hasComparableValue(totals, metric.key, target)) continue;
      const amount = totals[metric.key];
      metric.days += 1;
      if (totals.estimated) metric.estimatedDays += 1;
      if (amount < target) metric.belowDays += 1;
      metric.sum += amount;
      metric.targetSum += target;
    }
  }

  return {
    periodStart,
    periodEnd,
    recordedDays,
    confirmedDays,
    metrics: metrics.map(({ sum, targetSum, ...metric }) => ({
      ...metric,
      average: metric.days ? sum / metric.days : null,
      averageTarget: metric.days ? targetSum / metric.days : null,
    })),
  };
}
