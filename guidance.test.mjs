import assert from 'node:assert/strict';
import test from 'node:test';
import { dayGuidance, weeklyOverview } from './guidance.mjs';

const GOALS = { kcal: 2000, protein: 80, proteinGoal: 120, fiber: 30 };

function meal(item = {}, quantity = 1000) {
  return { kind: 'meal', items: [{ name: 'Repas test', unit: 'g', grams: quantity, estimated: false,
    kcal: 180, protein: 10, fat: 5, carbs: 20, fiber: 3, ...item }] };
}

test('propose des portions d’après Ciqual quand la cible sportive est suffisamment éloignée', () => {
  const guidance = dayGuidance([meal()], GOALS);
  assert.equal(guidance.title, 'Idées pour les protéines');
  assert.match(guidance.message, /20 g de protéines.*prochain repas/);
  assert.deepEqual(guidance.options.map(({ code, grams, amount }) => [code, grams, amount]), [
    [36018, 100, 30],
    [20904, 150, 20],
  ]);
  assert.ok(guidance.options.every(option => option.detail.includes('Ciqual 2025')));
});

test('priorise un écart de fibres plus marqué et conserve des portions concrètes', () => {
  const guidance = dayGuidance([meal({ fiber: 1 })], GOALS);
  assert.equal(guidance.title, 'Idées pour les fibres');
  assert.deepEqual(guidance.options.map(({ code, grams, amount }) => [code, grams, amount]), [
    [20360, 150, 13],
    [13015, 100, 4],
  ]);
});

test('écarte des suggestions les valeurs partielles, les petites différences et les jours sans repas', () => {
  assert.equal(dayGuidance([meal(), meal({ protein: null, fiber: null }, 100)], GOALS), null);
  assert.equal(dayGuidance([meal({ protein: 11.95, fiber: 2.95 })], GOALS), null);
  assert.equal(dayGuidance([meal({ protein: 10.4, fiber: 2.5, estimated: true })], GOALS), null);
  assert.equal(dayGuidance([{ ...meal(), kind: 'drink' }], GOALS), null);
  assert.equal(dayGuidance([meal()], null), null);
});

test('compare sept dates passées et calcule la couverture de chaque repère sur les jours confirmés', () => {
  const days = {
    '2026-11-02': { complete: true, entries: [meal({ kcal: 999 })], targets: GOALS },
    '2026-11-01': { complete: true, entries: [meal({ estimated: true })], targets: GOALS },
    '2026-10-31': { complete: true, entries: [meal({ kcal: null, protein: 12, fiber: null })], targets: GOALS },
    '2026-10-30': { complete: true, entries: [meal({ kcal: 190, fiber: 2.4 })], targets: { kcal: 2100, protein: 95 } },
    '2026-10-29': { entries: [meal()], targets: GOALS },
    '2026-10-28': { complete: true, entries: [meal()], targets: null },
    '2026-10-25': { complete: true, entries: [meal({ kcal: 999 })], targets: GOALS },
  };
  const week = weeklyOverview(days, '2026-11-02');
  assert.deepEqual([week.periodStart, week.periodEnd, week.recordedDays, week.confirmedDays],
    ['2026-10-26', '2026-11-01', 5, 4]);
  assert.deepEqual(week.metrics.map(({ key, days, average, averageTarget, estimatedDays, belowDays }) =>
    [key, days, average, averageTarget, estimatedDays, belowDays]), [
    ['kcal', 2, 1850, 2050, 1, 2],
    ['protein', 3, 320 / 3, 335 / 3, 1, 1],
    ['fiber', 1, 30, 30, 1, 0],
  ]);
});

test('conserve les valeurs de comparaison inconnues sans inventer une semaine à zéro', () => {
  const week = weeklyOverview({}, '2026-11-02');
  assert.equal(week.recordedDays, 0);
  assert.equal(week.confirmedDays, 0);
  assert.ok(week.metrics.every(({ days, average, averageTarget }) => days === 0 && average === null && averageTarget === null));
  assert.equal(weeklyOverview({}, '2026-06-31'), null);
});
