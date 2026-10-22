const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reserveCostMicroUsd, PRICE_PROFILE } = require('../workplaceAnalysisPricing');
const input = { model: 'claude-haiku-5-5', inputTokenUpperBound: 10000, maxOutputTokens: 2048,
  now: new Date('2026-10-22T12:00:00Z'), profile: PRICE_PROFILE };
test('pinned conservative input/output rates use integer micro-USD and round upward', () => {
  assert.equal(reserveCostMicroUsd(input), 10120);
  assert.equal(reserveCostMicroUsd({ ...input, inputTokenUpperBound: 1, maxOutputTokens: 2 }), 6);
  assert.equal(reserveCostMicroUsd({ ...input, inputTokenUpperBound: 100000 }), 55120);
});
test('invalid or unverified bounds, model and pricing profiles fail closed', () => {
  for (const patch of [{ model: 'claude-other' }, { inputTokenUpperBound: 0 }, { inputTokenUpperBound: 100001 },
    { inputTokenUpperBound: '100' }, { inputTokenUpperBound: Infinity }, { maxOutputTokens: 2049 }, { maxOutputTokens: 0.5 },
    { now: new Date('2026-10-29T00:00:00Z') }, { now: new Date('2026-10-21T00:00:00Z') }, { now: new Date(NaN) },
    { profile: { ...PRICE_PROFILE, inputRate: 0 } }, { profile: { ...PRICE_PROFILE, currency: 'PHP' } },
    { profile: { ...PRICE_PROFILE, expiresAt: '2027-01-01T00:00:00Z' } },
    { features: { serviceTier: 'priority' } }, { features: { tools: true } }, { features: { caching: true } }]) {
    assert.throws(() => reserveCostMicroUsd({ ...input, ...patch }));
  }
});
