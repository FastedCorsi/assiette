import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightTrend } from './weight-trend.mjs';

test('compare les moyennes de deux périodes adjacentes de 14 jours', () => {
  const days = {
    '2025-03-02': { weight: 50 },
    '2025-03-01': { weight: 78 },
    '2025-02-16': { weight: 79 },
    '2025-02-15': { weight: 80 },
    '2025-02-02': { weight: 81 },
    '2025-02-01': { weight: 99 },
  };
  assert.deepEqual(weightTrend(days, '2025-03-01'), {
    delta: -2, latestAverage: 78.5, previousAverage: 80.5, latestCount: 2, previousCount: 2,
  });
});

test('exige deux dates de pesée valides dans chaque période', () => {
  const days = {
    '2025-03-01': { weight: 78 },
    '2025-02-31': { weight: 79 },
    '2025-02-16': { weight: NaN },
    '2025-02-15': { weight: 80 },
    '2025-02-02': { weight: 81 },
  };
  assert.equal(weightTrend(days, '2025-03-01'), null);
  assert.equal(weightTrend(days, '2025-02-31'), null);
  assert.equal(weightTrend({}, '2025-03-01'), null);
});
