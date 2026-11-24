import test from 'node:test';
import assert from 'node:assert/strict';
import { calorieReview } from './adaptive-targets.mjs';
import { energyPlan, shiftDate } from './journal.mjs';

const TODAY = '2026-11-24';
const PROFILE = { age: 35, sex: 'male', height: 175, weight: 82, goal: 'lose', goalWeight: 76, activity: 'mostly-seated', sport: 0 };

function fourWeeks(profile = PROFILE, weeklyWeights = [82.1, 82, 81.9, 82], tweakDay = () => {}) {
  const plan = energyPlan(profile);
  const days = {};
  for (let index = 0; index < 28; index += 1) {
    const weekIndex = Math.floor(index / 7);
    const dayOfWeek = index % 7;
    const day = {
      complete: dayOfWeek < 5,
      entries: [{ kind: 'meal', items: [{ name: 'Repas test', grams: plan.kcal, kcal: 100, estimated: false }] }],
      targets: { kcal: plan.kcal },
    };
    if (dayOfWeek < 3) day.weight = weeklyWeights[weekIndex];
    tweakDay(day, weekIndex, dayOfWeek);
    days[shiftDate(TODAY, index - 28)] = day;
  }
  return days;
}

test('propose un essai de 100 kcal seulement après quatre semaines comparables', () => {
  const { kcal } = energyPlan(PROFILE);
  const result = calorieReview(fourWeeks(), TODAY, PROFILE);
  assert.equal(result.status, 'suggestion');
  assert.deepEqual(result.suggestion, { kcal: kcal - 100, delta: -100 });
  assert.equal(result.latest.averageKcal, kcal);
  assert.equal(result.latest.averageTarget, kcal);
  assert.equal(result.previous.loggedDays, 10);
  assert.equal(result.previous.weighIns, 6);
  assert.equal(Number(result.weightDelta.toFixed(1)), -0.1);
});

test('écarte la journée en cours et les jours non confirmés ou incomplets', () => {
  const days = fourWeeks(PROFILE, undefined, (day, week, index) => {
    if (week === 3 && index === 1) delete day.complete;
    if (week === 3 && index === 2) day.entries[0].items[0].kcal = null;
  });
  days[TODAY] = days[shiftDate(TODAY, -4)];
  const result = calorieReview(days, TODAY, PROFILE);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.latest.loggedDays, 8);
  assert.equal(result.suggestion, null);
});

test('demande des pesées dans chaque semaine', () => {
  const days = fourWeeks(PROFILE, undefined, (day, week) => {
    if (week === 0) delete day.weight;
    if (week === 1) day.weight = 82;
  });
  const result = calorieReview(days, TODAY, PROFILE);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.weightDelta, null);
  assert.equal(result.suggestion, null);
});

test('garde le repère quand la tendance suit l’objectif', () => {
  const result = calorieReview(fourWeeks(PROFILE, [83, 82.6, 82.3, 82]), TODAY, PROFILE);
  assert.equal(result.status, 'progress');
  assert.equal(result.suggestion, null);
  assert.equal(calorieReview(fourWeeks({ ...PROFILE, goal: 'maintain' }), TODAY, { ...PROFILE, goal: 'maintain' }).status, 'stable');
});

test('évite de donner une cible quand les pesées varient vite ou sans direction stable', () => {
  for (const weeklyWeights of [[86, 85, 83, 82], [81, 83, 84, 80]]) {
    const result = calorieReview(fourWeeks(PROFILE, weeklyWeights), TODAY, PROFILE);
    assert.equal(result.status, 'review');
    assert.equal(result.suggestion, null);
  }
});

test('vérifie le repère et les apports consignés avant de suggérer un ajustement', () => {
  const cases = [
    (day, week) => { if (week === 0) day.targets.kcal += 100; },
    (day, week) => { if (week === 3) day.entries[0].items[0].estimated = true; },
    (day, week, index) => { if (week === 3) day.entries[0].items[0].grams += index % 2 ? 250 : -250; },
  ];
  for (const change of cases) {
    const result = calorieReview(fourWeeks(PROFILE, undefined, change), TODAY, PROFILE);
    assert.equal(result.status, 'review');
    assert.equal(result.suggestion, null);
  }
});

test('respecte les limites de l’objectif de perte de poids et les repères manuels de protéines', () => {
  for (const profile of [
    { ...PROFILE, deficit: 750 },
    { ...PROFILE, goalWeight: 50 },
    { ...PROFILE, proteinMode: 'manual', proteinGrams: 166 },
  ]) {
    assert.equal(calorieReview(fourWeeks(profile), TODAY, profile).suggestion, null);
  }
  const reached = { ...PROFILE, goalWeight: 82.2 };
  assert.equal(calorieReview(fourWeeks(reached), TODAY, reached).status, 'goal-reached');
  const reachedWithLatestWeighIn = { ...PROFILE, weight: 76, customCalories: 1950 };
  assert.equal(calorieReview(fourWeeks(reachedWithLatestWeighIn), TODAY, reachedWithLatestWeighIn).suggestion, null);
});

test('suggère une hausse limitée quand le poids est stable sur un objectif de prise', () => {
  const profile = { ...PROFILE, goal: 'gain', goalWeight: 85 };
  const { kcal } = energyPlan(profile);
  const result = calorieReview(fourWeeks(profile), TODAY, profile);
  assert.deepEqual(result.suggestion, { kcal: kcal + 100, delta: 100 });
});
