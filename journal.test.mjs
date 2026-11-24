import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sportCaloriesPerDay } from './activity.mjs';
import {
  aggregateEntries, calculateTargets, exportJournal, formatDate, importJournal,
  loadJournal, localDate, saveJournal, shiftDate, summarizeDay, targetNotice,
} from './journal.mjs';

const profile = {
  name: 'Camille', age: 30, sex: 'female', height: 170, weight: 68,
  goal: 'maintain', activity: 'mostly-seated', sport: 0,
};
const entries = [
  {
    id: 'meal-test', label: 'Déjeuner', kind: 'meal', at: '2026-11-24T12:00:00Z',
    items: [{ name: 'Riz', grams: 125.5, unit: 'g', estimated: true, kcal: 128, protein: 3, carbs: 28, fat: null }],
  },
  {
    id: 'drink-test', label: 'Eau', kind: 'drink', at: '2026-11-24T13:00:00Z',
    items: [{ name: 'Eau', grams: 250, unit: 'ml', estimated: false, kcal: 0, protein: 0, carbs: 0, fat: 0 }],
  },
];

test('Henry, les niveaux EFSA et les MET du sport calculent une énergie journalière', () => {
  const baseline = calculateTargets(profile);
  assert.equal(baseline.kcal, 1956);
  assert.equal(calculateTargets({ ...profile, activity: 'on-feet' }).kcal, 2236);
  const training = { ...profile, sport: 4, sportMinutes: 60, sportType: 'strength' };
  assert.equal(sportCaloriesPerDay(training), 102);
  assert.equal(calculateTargets(training).kcal, 2058);
  assert.equal(calculateTargets({ ...training, sportMinutes: 30 }).kcal, 2007);
  assert.ok(sportCaloriesPerDay({ ...training, sportType: 'bike' }) > 102);
  assert.equal(sportCaloriesPerDay({ ...training, age: 65 }).toFixed(3), '103.865');
  assert.deepEqual(calculateTargets({ ...profile, sport: 4 }), baseline);
  assert.match(targetNotice({ ...profile, sport: 4 }), /durée/);
  assert.equal(calculateTargets({ ...profile, goal: 'gain' }).kcal, baseline.kcal + 300);
  const overweight = { ...profile, weight: 85 };
  assert.equal(calculateTargets({ ...overweight, goal: 'lose' }).kcal, calculateTargets(overweight).kcal - 500);
  assert.equal(calculateTargets({ ...profile, customCalories: 2300, water: 2.15 }).kcal, 2300);
  assert.equal(calculateTargets({ ...profile, customCalories: 2300, water: 2.15 }).water, 2150);
  assert.equal(calculateTargets({ ...profile, age: 17 }), null);
});

test('le déficit automatique est écarté hors du cadre retenu', () => {
  const light = { ...profile, weight: 48 };
  assert.deepEqual(calculateTargets(light), calculateTargets({ ...light, goal: 'lose' }));
  assert.deepEqual(calculateTargets(profile), calculateTargets({ ...profile, goal: 'lose' }));
  assert.deepEqual(calculateTargets(profile), calculateTargets({ ...profile, goal: 'lose', goalWeight: 48 }));
  assert.deepEqual(calculateTargets(profile), calculateTargets({ ...profile, goal: 'lose', goalWeight: 69 }));
  assert.match(targetNotice({ ...light, goal: 'lose' }), /maintien/);
  const lowEnergyEstimate = { ...profile, height: 120, weight: 38, age: 80 };
  assert.deepEqual(calculateTargets(lowEnergyEstimate), calculateTargets({ ...lowEnergyEstimate, goal: 'lose' }));
});

test('les fourchettes Anses sont converties en grammes et le repère d’eau reste séparé', () => {
  assert.deepEqual(calculateTargets(profile).ranges, {
    protein: [57, 97], carbs: [196, 268], fat: [77, 86], water: [1500, 2000],
  });
  assert.deepEqual(calculateTargets({ ...profile, activity: 'very-physical', customCalories: 2400 }).ranges.carbs, [300, 360]);
  assert.deepEqual(calculateTargets({ ...profile, age: 75, customCalories: 2000 }).ranges.protein, [75, 100]);
  const hotDrinks = { ...entries[1], id: 'coffee', items: [{ ...entries[1].items[0], name: 'Café', grams: 250 }] };
  const water = { ...entries[1], items: [{ ...entries[1].items[0], grams: 1300 }] };
  assert.equal(aggregateEntries([hotDrinks, water]).water, 1550);
  assert.equal(aggregateEntries([hotDrinks, water]).plainWater, 1300);
  assert.ok(summarizeDay([hotDrinks, water], calculateTargets(profile)).attention.some(message => message.includes('Eau saisie à 200 ml')));
  const manual = calculateTargets({ ...profile, water: 1.5 });
  assert.equal(manual.ranges.water, undefined);
  assert.ok(summarizeDay([hotDrinks, water], manual).positive.some(message => message.includes('Boissons saisies')));
});

test('un jour de calendrier suit la date locale et accepte les dates bissextiles', () => {
  assert.equal(localDate(new Date(2026, 10, 24, 0, 15)), '2026-11-24');
  assert.equal(shiftDate('2026-03-29', 1), '2026-03-30');
  assert.equal(shiftDate('2025-01-01', -1), '2024-12-31');
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftDate('2026-02-29', 1), null);
  assert.equal(formatDate('2026-11-24', { weekday: 'long' }), 'mardi');
});

test('les totaux gardent le volume, les décimales et les nutriments incomplets', () => {
  const totals = aggregateEntries(entries);
  assert.equal(totals.kcal, 160.64);
  assert.equal(totals.water, 250);
  assert.equal(totals.estimated, 1);
  assert.equal(totals.unknown, 1);
  assert.equal(totals.missing.fat, 1);
  assert.equal(totals.missing.kcal, 0);
  const { ranges, ...historicTargets } = calculateTargets(profile);
  const targets = { ...historicTargets, protein: Math.round(totals.protein) };
  const summary = summarizeDay(entries, targets);
  assert.ok(summary.positive.some(message => message.includes('Protéines')));
  assert.ok(summary.attention.some(message => message.includes('partiels')));
  assert.ok(summary.attention.every(message => !message.includes('Lipides')));
});

test('la sauvegarde préserve les pesées et repères historiques et rejette les entrées invalides', () => {
  const training = { ...profile, sport: 4, sportMinutes: 45, sportType: 'strength' };
  const historicTargets = { kcal: 2004, protein: 75, carbs: 251, fat: 78, water: 1500 };
  const state = {
    profile: training,
    days: {
      '2026-11-23': { entries: [], targets: historicTargets },
      '2026-11-24': { entries, targets: calculateTargets(training), weight: 67.4 },
    },
  };
  const restored = importJournal(exportJournal(state));
  const date = '2026-11-24';
  assert.equal(restored.days[date].weight, 67.4);
  assert.equal(restored.days[date].entries[0].items[0].fat, null);
  assert.deepEqual(restored.days[date].targets, state.days[date].targets);
  assert.deepEqual(restored.days['2026-11-23'].targets, historicTargets);
  assert.equal(restored.profile.sportMinutes, 45);
  assert.equal(restored.profile.sportType, 'strength');
  assert.ok(!Object.hasOwn(importJournal(exportJournal({ ...state, profile })).profile, 'sportType'));
  let saved = null;
  const memoryStorage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  assert.deepEqual(loadJournal(memoryStorage), { profile: null, days: {} });
  saveJournal(state, memoryStorage);
  assert.deepEqual(loadJournal(memoryStorage), restored);
  assert.throws(() => importJournal('invalide'), /JSON/);
  assert.throws(() => importJournal(JSON.stringify({ ...state, version: 2 })), /format/);
  state.days[date].entries = [entries[0], entries[0]];
  assert.throws(() => exportJournal(state), /double/);
  assert.deepEqual(loadJournal(memoryStorage), restored);
});
