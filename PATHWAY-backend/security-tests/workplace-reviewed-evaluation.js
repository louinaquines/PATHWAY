// Local synthetic evaluation only; imports never load credentials or call a provider.
const fs = require('node:fs'), path = require('node:path'), { createHash, randomUUID } = require('node:crypto');
const { digest } = require('../workplaceJournalConsent');
const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const { reserveCostMicroUsd } = require('../workplaceAnalysisPricing');
const { scoreWorkplaceEvaluation } = require('../workplaceEvaluation');
const { openPilotLedger } = require('./workplace-claude-pilot');
const DATASET = path.resolve(__dirname, '../../project-notes/WORKPLACE-MULTILINGUAL-REVIEW.json');
const DATASET_SHA = 'c370bd361646fbebce8401b3807628a48548d0f759161942e929099219a614b9';
const STOP = 'Explicit review required before any continuation.\n';
const fail = () => Object.assign(Error('Reviewed evaluation unavailable.'), { code: 'EVALUATION_UNAVAILABLE' });
function writeRow(file, row) {
  const fd = fs.openSync(file, fs.existsSync(file) ? 'a' : 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(row) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
async function readCount(response) {
  if (!response?.ok) { await response?.body?.cancel().catch(() => {}); throw fail(); }
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength; if (length > 32768) throw fail(); chunks.push(Buffer.from(value)); }
  } finally { await reader.cancel().catch(() => {}); }
  const n = JSON.parse(Buffer.concat(chunks).toString('utf8')).input_tokens;
  if (!Number.isSafeInteger(n) || n < 1 || n > 12000) throw fail(); return n;
}
async function runReviewedEvaluation({ enabled = false, reviewedRearm = false, apiKey, ledgerFile, reportFile, transport, clock = () => new Date() } = {}) {
  if (enabled !== true) return { status: 'disabled', attempted: 0 };
  if (reviewedRearm !== true || typeof apiKey !== 'string' || !apiKey.trim() || typeof transport !== 'function'
    || typeof ledgerFile !== 'string' || typeof reportFile !== 'string' || path.resolve(ledgerFile) === path.resolve(reportFile)) throw fail();
  const raw = fs.readFileSync(DATASET), hash = () => createHash('sha256').update(fs.readFileSync(DATASET)).digest('hex');
  if (createHash('sha256').update(raw).digest('hex') !== DATASET_SHA) throw fail();
  const dataset = JSON.parse(raw), examples = dataset.examples;
  if (dataset.syntheticOnly !== true || examples.length !== 12 || examples.some(e => e.reviewedBy !== 'Loui Jay Naquines' || e.reviewedAt !== '2026-10-23'
    || !['none','normal','high'].includes(e.expected))) throw fail();
  let last = -Infinity;
  const now = () => { const n = clock(); if (!(n instanceof Date) || !Number.isFinite(n.getTime()) || n.getTime() < last) throw fail(); last = n.getTime(); return n; };
  const plans = examples.map(e => {
    const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey, allowedSources: [e.text], fetcher: async () => { throw fail(); } });
    const prepared = adapter.prepare(e.text); reserveCostMicroUsd({ ...prepared, now: now() });
    return { e, prepared, attemptId: digest(['reviewed-evaluation-v1', DATASET_SHA, e.id]), sourceHash: digest(e.text), requestHash: digest(prepared.request) };
  });
  const ledger = openPilotLedger(ledgerFile); let rows = [], attempted = 0, status = 'complete';
  const save = row => { writeRow(reportFile, row); rows.push(row); };
  try {
  if (fs.existsSync(reportFile)) {
    if (fs.lstatSync(reportFile).isSymbolicLink() || fs.statSync(reportFile).size > 1048576) throw fail();
    const contents = fs.readFileSync(reportFile, 'utf8'); if (!contents.endsWith('\n')) throw fail();
    rows = contents.trimEnd().split('\n').map(line => JSON.parse(line));
    const ids = new Set();
    for (const r of rows) {
      const p = plans.find(p => p.e.id === r.id);
      if (!p || ids.has(r.id) || !['none','normal','high','unavailable'].includes(r.predicted) || r.sourceHash !== p.sourceHash
        || r.requestHash !== p.requestHash || r.attemptId !== p.attemptId || r.model !== p.prepared.model || !Number.isFinite(Date.parse(r.at))) throw fail();
      ids.add(r.id);
    }
  }
    if (rows.some(r => r.predicted === 'unavailable' || r.predicted !== examples.find(e => e.id === r.id).expected)) status = 'review-required';
    for (const p of plans) {
      if (status === 'review-required') break;
      if (rows.some(r => r.id === p.e.id)) { if (!ledger.has(p.attemptId)) throw fail(); continue; }
      const start = now(), day = start.toISOString().slice(0, 10);
      const base = { id: p.e.id, sourceHash: p.sourceHash, requestHash: p.requestHash, attemptId: p.attemptId, at: start.toISOString(), model: p.prepared.model };
      if (ledger.has(p.attemptId)) { save({ ...base, predicted: 'unavailable', diagnostic: 'reserved-without-result' }); status = 'review-required'; break; }
      const totals = ledger.snapshot(start), cost = reserveCostMicroUsd({ ...p.prepared, now: start });
      if (totals.attempts >= 10 || totals.reservedMicroUsd > 100000 - cost) { status = 'daily-limit'; break; }
      const stopFile = ledgerFile + '.stopped';
      if (!ledger.isStopped() || fs.lstatSync(stopFile).isSymbolicLink() || fs.readFileSync(stopFile, 'utf8') !== STOP) throw fail();
      // Explicitly approved rearm: keep each stop file; the ledger lock excludes another evaluator.
      fs.renameSync(stopFile, stopFile + '.review-' + randomUUID());
      try {
        if (ledger.reserve(p.attemptId, cost, now()).status !== 'reserved') throw fail();
      } finally { ledger.stop(); }
      attempted++;
      const signal = AbortSignal.timeout(25000);
      const check = () => {
        const t = now();
        if (t.toISOString().slice(0, 10) !== day || t - start >= 25000 || signal.aborted || hash() !== DATASET_SHA
          || !ledger.isStopped() || fs.readFileSync(stopFile, 'utf8') !== STOP) throw fail();
        reserveCostMicroUsd({ ...p.prepared, now: t }); ledger.snapshot(t);
      };
      let countedTokens;
      try {
        check(); const b = JSON.parse(p.prepared.request);
        const countBody = JSON.stringify({ model: b.model, system: b.system, messages: b.messages, thinking: b.thinking, output_config: b.output_config });
        countedTokens = await readCount(await transport('https://api.anthropic.com/v1/messages/count_tokens', {
          method: 'POST', redirect: 'error', signal, headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: countBody,
        }));
        check();
        const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey, allowedSources: [p.e.text],
          fetcher: async (url, options) => { check(); return transport(url, { ...options, signal }); } });
        const result = await adapter.analyze(adapter.prepare(p.e.text), { signal });
        check();
        if (!result.decision || result.usage.inputTokens > 14000 || result.usage.outputTokens > 1024) throw fail();
        const findings = result.decision.findings;
        const predicted = findings.some(f => f.priority === 'high') ? 'high' : findings.length ? 'normal' : 'none';
        save({ ...base, predicted, countedTokens, usage: result.usage });
        if (predicted !== p.e.expected) { status = 'review-required'; break; }
      } catch {
        save({ ...base, predicted: 'unavailable', ...(countedTokens ? { countedTokens } : {}), diagnostic: 'provider-or-validation-uncertain' });
        status = 'review-required'; break;
      }
    }
    const completed = rows.filter(r => r.predicted !== 'unavailable').length;
    return { status, attempted, completed, remaining: 12 - completed, unattempted: 12 - rows.length, unavailable: rows.length - completed,
      fullDatasetEvaluated: completed === 12, metricsForRecordedExamples: rows.length ? scoreWorkplaceEvaluation(examples.filter(e => rows.some(r => r.id === e.id)), rows) : null,
      reportFile, allowance: ledger.snapshot(now()), syntheticOnly: true, productionWrites: 0 };
  } finally { try { ledger.stop(); } finally { ledger.close(); } }
}
async function main() {
  if (!process.argv.includes('--paid-reviewed-12') || !process.argv.includes('--reviewed-rearm') || process.env.PATHWAY_REVIEWED_EVALUATION_APPROVED !== '1'
    || process.env.NODE_ENV === 'production' || process.env.K_SERVICE) throw fail();
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const release = path.resolve(__dirname, '../../output/release');
  const result = await runReviewedEvaluation({ enabled: true, reviewedRearm: true, apiKey: process.env.ANTHROPIC_API_KEY,
    ledgerFile: path.join(release, 'workplace-claude-pilot-reservations.jsonl'),
    reportFile: path.join(release, 'workplace-reviewed-evaluation-' + DATASET_SHA + '.jsonl'), transport: fetch });
  console.log(JSON.stringify(result));
  if (result.status === 'review-required') process.exitCode = 1;
}
if (require.main === module) main().catch(() => { console.error(JSON.stringify({ status: 'evaluation-unavailable', secretsPrinted: false, automaticRetry: false })); process.exitCode = 1; });
module.exports = { runReviewedEvaluation };
