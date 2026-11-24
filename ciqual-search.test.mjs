import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCiqualFood, findCiqualFoodByCode, searchCiqualFoods } from './ciqual-search.mjs';

test('la clémentine, sa forme au pluriel et la mandarine reprennent les mêmes données officielles', () => {
  const reference = {
    name: 'Clémentine ou mandarine, chair sans peau, sans pépins, crue',
    kcal: 45.5, protein: 0.81, carbs: 9.17, fat: 0.25, fiber: 1.7, source: 'Ciqual 2025', unit: 'g',
  };
  for (const name of ['Clémentine', 'clementines', 'Clémentines crues', 'mandarine']) {
    assert.deepEqual(findCiqualFood(name), reference);
  }
  assert.deepEqual(findCiqualFoodByCode(13024), reference);
  assert.equal(findCiqualFoodByCode(18066).fiber, 0);
});

test('les états explicites sélectionnent les lignes proches sans confondre cru et cuit', () => {
  assert.equal(findCiqualFood('fenouil'), null);
  assert.equal(findCiqualFood('fenouil CRU')?.name, 'Fenouil, cru');
  assert.equal(findCiqualFood('fenouil cuit')?.name, 'Fenouil, cuit (aliment moyen)');
  assert.equal(findCiqualFood('fenouil cuit à l’eau')?.name, "Fenouil, bouilli/cuit à l'eau");
  assert.equal(findCiqualFood('fenouil bouilli')?.name, "Fenouil, bouilli/cuit à l'eau");
  assert.equal(findCiqualFood('clémentine cuite'), null);
  assert.equal(findCiqualFood('endive cuite'), null);
  assert.equal(findCiqualFood('endive cuite au four')?.name, 'Endive, rôtie/cuite au four');
  assert.equal(findCiqualFood('pomme de terre cuite au four'), null);
  assert.equal(findCiqualFood('pomme de terre cuite au four sans peau')?.name,
    'Pomme de terre, sans peau, rôtie/cuite au four');
});

test('la résolution automatique écarte les ambiguïtés et préserve les données absentes', () => {
  assert.equal(findCiqualFood('clémentines Carrefour'), null);
  assert.equal(findCiqualFood('cassoulet'), null);
  assert.equal(findCiqualFood('citron'), null);
  assert.equal(findCiqualFood('pamplemousse'), null);
  assert.equal(findCiqualFood('poireau cuit')?.kcal, null);
  assert.equal(findCiqualFood('poireau cuit')?.protein, 0.81);
});

test('les suggestions acceptent les préfixes et donnent la priorité au nom proche', () => {
  assert.equal(findCiqualFood('clémentin'), null);
  assert.equal(searchCiqualFoods('CLEMENTIN', 1)[0]?.kcal, 45.5);
  assert.equal(searchCiqualFoods('Mandarin', 1)[0]?.kcal, 45.5);
  assert.match(searchCiqualFoods('pamplemousse', 1)[0]?.name, /^Pomelo \(dit Pamplemousse\),/);
  assert.equal(searchCiqualFoods("fenouils cuits à l'éto", 1)[0]?.name, "Fenouil, cuit à l'étouffée");
  assert.deepEqual(searchCiqualFoods('clémentines Carrefour'), []);
  assert.deepEqual(searchCiqualFoods(' ? '), []);
  assert.deepEqual(searchCiqualFoods('clémentine', 0), []);
});
