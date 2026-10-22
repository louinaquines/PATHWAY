const { isDeepStrictEqual } = require('node:util');
const { prepareConcernRequest, validateConcernDecision } = require('./workplaceConcernDetector');
const { PRICE_PROFILE, FEATURES } = require('./workplaceAnalysisPricing');
function createWorkplaceClaudeAdapter({ enabled, apiKey, allowedSources = [], fetcher = fetch } = {}) {
  const sources = new Set(allowedSources), prepared = new Map();
  const fail = code => Object.assign(Error('Claude workplace pilot unavailable.'),{ code });
  function allowed() { if (enabled !== true || typeof apiKey !== 'string' || !apiKey.trim()) throw fail('CLAUDE_DISABLED'); }
  function prepare(rawNotes) {
    allowed(); if (!sources.has(rawNotes)) throw fail('CLAUDE_SOURCE');
    const prompt = prepareConcernRequest(rawNotes);
    const request = JSON.stringify({ model: PRICE_PROFILE.model, max_tokens: 1024, thinking: { type: 'disabled' }, output_config: { effort: 'low' },
      system: prompt.instructions, messages: [{ role: 'user', content: JSON.stringify({ journalNotes: prompt.source }) }] });
    if (Buffer.byteLength(request,'utf8') > 5000) throw fail('CLAUDE_INPUT');
    // Pilot-only engineering allowance, not a tokenizer proof or invoice guarantee.
    const value = Object.freeze({ model: PRICE_PROFILE.model, inputTokenUpperBound: 14000, maxOutputTokens: 1024, features: FEATURES, request });
    prepared.set(request,{ value, rawNotes }); return value;
  }
  async function analyze(value,{ signal } = {}) {
    allowed(); const original = prepared.get(value?.request);
    if (!original || !isDeepStrictEqual(value,original.value) || !sources.has(original.rawNotes)) throw fail('CLAUDE_INPUT');
    if (signal?.aborted) throw fail('CLAUDE_TRANSPORT_UNCERTAIN');
    let response;
    try {
      response = await fetcher('https://api.anthropic.com/v1/messages',{ method: 'POST', redirect: 'error',
        signal: signal ? AbortSignal.any([signal,AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: value.request });
    } catch { throw fail('CLAUDE_TRANSPORT_UNCERTAIN'); }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw fail('CLAUDE_PROVIDER'); }
    let result;
    try {
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { while (true) { const { done,value: chunk } = await reader.read(); if (done) break;
        size += chunk.byteLength; if (size > 32768) throw Error(); chunks.push(Buffer.from(chunk));
      } } finally { await reader.cancel().catch(() => {}); }
      result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result.model !== PRICE_PROFILE.model || result.stop_reason !== 'end_turn' || !result.usage) throw Error();
      const u = result.usage, integer = n => Number.isSafeInteger(n) && n >= 0;
      if (!integer(u.input_tokens) || !integer(u.output_tokens) || (u.cache_read_input_tokens ?? 0) !== 0 || (u.cache_creation_input_tokens ?? 0) !== 0
        || (u.service_tier !== undefined && u.service_tier !== 'standard')
        || (u.server_tool_use && Object.values(u.server_tool_use).some(n => n !== 0))
        || (u.cache_creation && Object.values(u.cache_creation).some(n => n !== 0))) throw Error();
      const usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
      if (usage.inputTokens > value.inputTokenUpperBound || usage.outputTokens > value.maxOutputTokens) return { usage };
      if (!Array.isArray(result.content) || result.content.length !== 1 || result.content[0]?.type !== 'text' || typeof result.content[0].text !== 'string') throw Error();
      return { usage, decision: validateConcernDecision(original.rawNotes,JSON.parse(result.content[0].text)) };
    } catch { throw fail('CLAUDE_OUTPUT'); }
  }
  return { prepare, analyze };
}
module.exports = { createWorkplaceClaudeAdapter };
