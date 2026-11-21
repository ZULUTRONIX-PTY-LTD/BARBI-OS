import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FINTECH_RAILS, type FinTechRailStatus } from './moduleCatalog';
import {
  DEFAULT_USD_TO_ZAR_RATE,
  computeVentureAllocation,
  formatVentureCurrency,
  parseRailPaperAmount,
} from './ventureAllocation';

test('parseRailPaperAmount parses ZAR and USD paper labels accurately', () => {
  assert.deepEqual(parseRailPaperAmount('R 125,000.00 (Paper)', 'ZAR'), {
    amount: 125000,
    currency: 'ZAR',
  });
  assert.deepEqual(parseRailPaperAmount('$ 5,000.00 (Dry-Run)', 'USD'), {
    amount: 5000,
    currency: 'USD',
  });
  assert.deepEqual(parseRailPaperAmount('$ 10,000.00 (Demo)', 'MULTI'), {
    amount: 10000,
    currency: 'USD',
  });
  assert.equal(parseRailPaperAmount('Staging Catalog', 'MULTI'), null);
});

test('computeVentureAllocation buckets DEFAULT_FINTECH_RAILS into EasyEquities, Crypto, and Cash', () => {
  const summary = computeVentureAllocation(DEFAULT_FINTECH_RAILS, {
    displayCurrency: 'ZAR',
    usdToZarRate: 18.25,
  });

  assert.equal(summary.slices.length, 3);
  assert.deepEqual(
    summary.slices.map((s) => s.label),
    ['EasyEquities', 'Crypto', 'Cash']
  );

  const ee = summary.slices.find((s) => s.key === 'easyequities')!;
  const crypto = summary.slices.find((s) => s.key === 'crypto')!;
  const cash = summary.slices.find((s) => s.key === 'cash')!;

  assert.equal(ee.valueZar, 125000);
  assert.equal(crypto.valueZar, 5000 * 18.25);
  assert.equal(cash.valueZar, 10000 * 18.25);
  assert.equal(summary.totalZar, 125000 + 15000 * 18.25);

  const pctSum = ee.percentage + crypto.percentage + cash.percentage;
  assert.ok(Math.abs(pctSum - 100) <= 0.2, `Expected percentage sum ~100, got ${pctSum}`);
  assert.equal(ee.hasLiveArmed, false);
  assert.deepEqual(ee.railIds, ['ee-portfolio']);
  assert.deepEqual(crypto.railIds, ['freqtrade-crypto']);
  assert.ok(cash.railIds.includes('mt5-forex'));
  assert.ok(cash.railIds.includes('paypal-mcp'));
});

test('computeVentureAllocation converts to USD and propagates Live Gate status', () => {
  const mutated: FinTechRailStatus[] = DEFAULT_FINTECH_RAILS.map((r) =>
    r.id === 'ee-portfolio' ? { ...r, sandboxMode: false } : r
  );

  const usdSummary = computeVentureAllocation(mutated, {
    displayCurrency: 'USD',
    usdToZarRate: DEFAULT_USD_TO_ZAR_RATE,
  });

  const ee = usdSummary.slices.find((s) => s.key === 'easyequities')!;
  assert.equal(ee.hasLiveArmed, true);
  assert.equal(usdSummary.displayCurrency, 'USD');
  assert.equal(formatVentureCurrency(usdSummary.totalDisplayValue, 'USD'), '$ 21,849');
  assert.equal(formatVentureCurrency(usdSummary.totalZar, 'ZAR'), 'R 398,750');
});

test('computeVentureAllocation handles empty or zero-balance rails gracefully', () => {
  const emptySummary = computeVentureAllocation([]);
  assert.equal(emptySummary.totalZar, 0);
  assert.equal(emptySummary.totalDisplayValue, 0);
  assert.equal(emptySummary.slices.length, 3);
  for (const s of emptySummary.slices) {
    assert.equal(s.percentage, 0);
    assert.equal(s.displayValue, 0);
  }
});
