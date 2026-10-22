// Arithmetic over a trusted adapter's upper bound, not a tokenizer or invoice guarantee.
const PRICE_PROFILE = Object.freeze({ model: 'claude-haiku-5-5', currency: 'USD', inputRate: 0.5, outputRate: 2.5,
  reviewedAt: '2026-10-22T00:00:00Z', expiresAt: '2026-10-29T00:00:00Z' });
const FEATURES = Object.freeze({ serviceTier: 'standard', inferenceGeo: 'global', tools: false, caching: false, batch: false });
function reserveCostMicroUsd({ model, inputTokenUpperBound, maxOutputTokens, now, profile = PRICE_PROFILE, features = FEATURES }) {
  const reviewed = Date.parse(profile?.reviewedAt), expires = Date.parse(profile?.expiresAt);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isFinite(reviewed) || !Number.isFinite(expires)
    || reviewed > now.getTime() || expires <= now.getTime() || expires <= reviewed || expires - reviewed > 7 * 86400000
    || model !== PRICE_PROFILE.model || profile.model !== model || profile.currency !== 'USD'
    || profile.inputRate !== 0.5 || profile.outputRate !== 2.5
    || !features || Object.keys(features).length !== Object.keys(FEATURES).length || Object.entries(FEATURES).some(([k,v]) => features[k] !== v)
    || !Number.isSafeInteger(inputTokenUpperBound) || inputTokenUpperBound <= 0 || inputTokenUpperBound > 100000
    || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens > 2048) throw new Error('Workplace pricing unavailable.');
  const cost = Math.ceil(inputTokenUpperBound * profile.inputRate + maxOutputTokens * profile.outputRate);
  if (!Number.isSafeInteger(cost) || cost <= 0 || cost > 100000) throw new Error('Workplace pricing unavailable.');
  return cost;
}
module.exports = { PRICE_PROFILE, FEATURES, reserveCostMicroUsd };
