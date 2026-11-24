import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupProducts, parseMeal } from './nutrition.mjs';

test('parses a French list without splitting decimal commas', () => {
  const items = parseMeal('150 g de riz, 2 œufs, 1,5 L d’eau; huile d’olive (7,5 g)\n200g de fromage blanc 0%');
  assert.deepEqual(items.map(({ name, grams, estimated, unit }) => [name, grams, estimated, unit]), [
    ['Riz blanc cuit', 150, false, 'g'],
    ['Œuf dur', 100, true, 'g'],
    ['Eau', 1500, false, 'ml'],
    ['Huile d’olive', 7.5, false, 'g'],
    ['Fromage blanc 0 %', 200, false, 'g'],
  ]);
});

test('keeps estimates visible for household portions and converts oil volume', () => {
  const items = parseMeal('un demi-avocat, 250 ml de soupe, 2 tranches de pain complet, 1 c. à s. d’huile, 15ml huile, 2x125 g yaourt');
  assert.deepEqual(items.map(({ grams, estimated, unit, kcal }) => [grams, estimated, unit, kcal]), [
    [75, true, 'g', 203],
    [250, false, 'ml', 36.8],
    [60, true, 'g', 234],
    [13.65, true, 'g', 899],
    [13.65, true, 'g', 899],
    [250, false, 'g', 50.1],
  ]);
});

test('retains unknown labels and missing nutrient values', () => {
  const [branded, unlabelled, unknown] = parseMeal('120g Skyr Danone, 25cl, boisson maison', true);
  assert.deepEqual([branded.query, branded.grams, branded.unit, branded.kcal], ['Skyr Danone', 120, 'g', null]);
  assert.deepEqual([unlabelled.name, unlabelled.grams, unlabelled.protein], ['Boisson à identifier', 250, null]);
  assert.deepEqual([unknown.name, unknown.grams, unknown.unit, unknown.estimated], ['boisson maison', 250, 'ml', true]);
});

test('retrouve les calories des clémentines et plats du catalogue', () => {
  const items = parseMeal('2 clémentines, 125,5 g de clementine, 150 g de paëlla, 200 g de couscous au poulet, 100 g d’endive crue');
  assert.deepEqual(items.map(({ grams, kcal, estimated }) => [grams, kcal, estimated]), [
    [150, 45.5, true], [125.5, 45.5, false], [150, 135, false], [200, 130, false], [100, 16.6, false],
  ]);
  assert.ok(items.every(item => item.source === 'Ciqual 2025'));
  assert.equal(parseMeal('100 g de mon mélange maison unique')[0].kcal, null);
});

test('leaves invalid explicit quantities blank for correction', () => {
  const items = parseMeal('0g de riz, -15,5 g de poulet, 0 œuf, -2 verres d’eau, 101kg de riz');
  assert.deepEqual(items.map(item => item.grams), [null, null, null, null, null]);
});

test('reads OFF products by free text or barcode and preserves missing macros', async t => {
  const product = {
    code: '0000000000000', product_name_fr: 'Exemple', quantity: '25 cl', brands: 'Test',
    nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 0, carbohydrates_100g: 12 },
  };
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.origin, 'https://world.openfoodfacts.org');
    const isBarcode = url.pathname === '/api/v3/product/0000000000000';
    if (!isBarcode) {
      assert.equal(url.pathname, '/cgi/search.pl');
      assert.equal(url.searchParams.get('search_terms'), 'marque à tester');
    }
    return new Response(JSON.stringify(isBarcode ? { product } : { products: [product] }));
  });
  for (const query of ['marque à tester', '0000000000000']) {
    assert.deepEqual(await lookupProducts(query), [{
      name: 'Exemple · Test', kcal: 100, protein: 0, carbs: 12, fat: null, source: 'Open Food Facts',
      url: 'https://world.openfoodfacts.org/product/0000000000000', unit: 'ml',
    }]);
  }
});
