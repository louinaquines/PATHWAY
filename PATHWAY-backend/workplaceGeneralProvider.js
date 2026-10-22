// Uninstalled provider boundary: no environment loading, default credentials or automatic activation.
const { isDeepStrictEqual } = require('node:util');
const { createWorkplaceClaudeAdapter } = require('./workplaceClaudeAdapter');
const { DISCLOSURE_VERSION, LIMITS } = require('./workplaceRealUsePolicy');
const { reserveCostMicroUsd } = require('./workplaceAnalysisPricing');
const unavailable = () => Object.assign(Error('Journal analysis unavailable.'), { code: 'GENERAL_ANALYSIS_UNAVAILABLE' });
function createGeneralJournalProvider({ enabled = false, apiKey, source, disclosureVersion, authority, transport, clock = () => new Date() } = {}) {
  const valid = enabled === true && disclosureVersion === DISCLOSURE_VERSION && typeof source === 'string' && typeof apiKey === 'string' && !!apiKey.trim()
    && typeof transport === 'function' && ['assertReady','reserve','claim','acceptCount','stop','assertContinuation'].every(k => typeof authority?.[k] === 'function');
  const disabled = { prepare() { throw unavailable(); }, async analyze() { throw unavailable(); } };
  if (!valid) return disabled;
  let prepared, used = false, currentSignal;
  const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey, allowedSources: [source], fetcher: async (url, options) => transport(url, { ...options, signal: currentSignal }) });
  return {
    prepare(notes) { if (notes !== source) throw unavailable(); prepared = adapter.prepare(notes); return prepared; },
    async analyze(value, { signal, assertReady } = {}) {
      let ticket;
      try {
        if (used || !prepared || !isDeepStrictEqual(value, prepared) || !signal || signal.aborted) throw unavailable(); used = true;
        const start = clock().getTime(), day = new Date(start).toISOString().slice(0, 10); let last = start;
        currentSignal = AbortSignal.any([signal, AbortSignal.timeout(25000)]);
        const check = async () => {
          const tick = () => { const n = clock().getTime(); if (!Number.isFinite(n) || n < last || n - start >= 25000 || new Date(n).toISOString().slice(0, 10) !== day || currentSignal.aborted) throw unavailable(); last = n; reserveCostMicroUsd({ ...prepared, now: new Date(n) }); };
          tick(); await authority.assertReady(prepared); if (assertReady) await assertReady(); await authority.assertContinuation(ticket, prepared); tick();
        };
        await check(); await authority.reserve(prepared); await check(); await authority.claim('count', prepared); await check();
        const b = JSON.parse(prepared.request), payload = JSON.stringify({ model: b.model, system: b.system, messages: b.messages, thinking: b.thinking, output_config: b.output_config });
        const r = await transport('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST', redirect: 'error', signal: currentSignal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: payload });
        if (!r?.ok) { await r?.body?.cancel().catch(() => {}); throw unavailable(); }
        const reader = r.body.getReader(), chunks = []; let size = 0;
        try { while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.byteLength; if (size > 32768) throw unavailable(); chunks.push(Buffer.from(chunk)); } }
        finally { await reader.cancel().catch(() => {}); }
        const count = JSON.parse(Buffer.concat(chunks).toString('utf8')).input_tokens;
        if (!Number.isSafeInteger(count) || count < 1 || count > LIMITS.countAdmission) throw unavailable();
        await check(); await authority.acceptCount(prepared, count); await check(); await authority.claim('generation', prepared);
        ticket = await authority.stop(prepared); await check();
        const result = await adapter.analyze(prepared, { signal: currentSignal });
        // Known accounting overflow must reach the worker brake even if decision authority is now stale.
        if (result.usage.inputTokens > LIMITS.inputAllowance || result.usage.outputTokens > LIMITS.outputTokens) return { usage: result.usage };
        await check(); return result;
      } catch { try { await authority.stop(prepared); } catch {} throw unavailable(); }
    },
  };
}
module.exports = { createGeneralJournalProvider };
