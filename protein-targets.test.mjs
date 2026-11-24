import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proteinPlan } from './protein-targets.mjs';

const ADULT = { weight: 80, height: 180 };
const GENERAL_FAT_RANGE = [76, 86];

test('la formule générale reste utilisée sans choix explicite', () => {
  assert.equal(proteinPlan(ADULT, 1950, GENERAL_FAT_RANGE), null);
  assert.equal(proteinPlan({ ...ADULT, proteinMode: 'general' }, 1950, GENERAL_FAT_RANGE), null);
});

test('la cible par kg et les plages de sport utilisent le budget restant', () => {
  const plan = proteinPlan({ ...ADULT, proteinMode: 'training' }, 1950, GENERAL_FAT_RANGE);
  assert.equal(plan.goal, 128);
  assert.deepEqual(plan.protein, [96, 160]);
  assert.deepEqual(plan.fat, [44, 75]);
  assert.deepEqual(plan.carbs, [190, 260]);
  assert.match(plan.note, /1,6 g\/kg\/j sur 80 kg \(poids actuel\)/);
  for (const [carbs, fat] of [[plan.carbs[0], plan.fat[1]], [plan.carbs[1], plan.fat[0]]]) {
    const total = plan.goal * 4 + carbs * 4 + fat * 9;
    assert.ok(total <= 1950 && total > 1946);
  }
});

test('la cible manuelle de 130 g tient dans un budget de 1 950 kcal', () => {
  const plan = proteinPlan({ ...ADULT, proteinMode: 'manual', proteinGrams: 130 }, 1950, GENERAL_FAT_RANGE);
  assert.equal(plan.goal, 130);
  assert.deepEqual(plan.protein, [130, 130]);
  assert.deepEqual(plan.fat, GENERAL_FAT_RANGE);
  assert.deepEqual(plan.carbs, [164, 186]);
  assert.match(plan.note, /manuellement/);
});

test('la formule sportive à IMC élevé utilise un poids visé approprié', () => {
  const training = { height: 180, weight: 120, proteinMode: 'training' };
  assert.match(proteinPlan(training, 1950, GENERAL_FAT_RANGE).error, /poids visé/);
  for (const goalWeight of [50, 100]) {
    assert.match(proteinPlan({ ...training, goalWeight }, 1950, GENERAL_FAT_RANGE).error, /poids visé/);
  }
  const plan = proteinPlan({ ...training, goalWeight: 85 }, 1950, GENERAL_FAT_RANGE);
  assert.equal(plan.goal, 136);
  assert.match(plan.note, /85 kg \(poids visé\)/);
});

test('la limite de répartition borne la plage affichée et écarte une cible incompatible', () => {
  const training = { ...ADULT, proteinMode: 'training' };
  const plan = proteinPlan(training, 1600, GENERAL_FAT_RANGE);
  assert.deepEqual(plan.protein, [96, 140]);
  assert.match(plan.note, /35 %/);
  assert.match(proteinPlan({ ...training, proteinPerKg: 2 }, 1600, GENERAL_FAT_RANGE).error, /140 g/);
  assert.match(proteinPlan({ ...ADULT, proteinMode: 'manual', proteinGrams: 150 }, 1600, GENERAL_FAT_RANGE).error, /140 g/);
  assert.equal(proteinPlan({ ...ADULT, proteinMode: 'manual', proteinGrams: 126 }, 1440, [56, 64]).goal, 126);
});
