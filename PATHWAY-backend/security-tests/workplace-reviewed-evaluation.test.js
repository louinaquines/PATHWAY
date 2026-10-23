const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openPilotLedger } = require('./workplace-claude-pilot');
const dataset = require('../../project-notes/WORKPLACE-MULTILINGUAL-REVIEW.json');
const run = options => require('./workplace-reviewed-evaluation').runReviewedEvaluation(options);
const base = Date.parse('2026-10-23T13:00:00Z');
async function fixture(work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-reviewed-eval-'));
  const file = path.join(dir, 'ledger.jsonl'), report = path.join(dir, 'results.jsonl');
  const ledger = openPilotLedger(file); ledger.stop(); ledger.close();
  let instant = base, calls = 0;
  const options = { enabled: true, reviewedRearm: true, apiKey: 'SYNTHETIC', ledgerFile: file, reportFile: report,
    clock: () => new Date(instant), transport: async (url, request) => {
      calls++;
      assert.equal(fs.existsSync(file + '.stopped'), true);
      assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length >= 2, true);
      if (url.endsWith('/count_tokens')) return Response.json({ input_tokens: 600 });
      const body = JSON.parse(request.body), source = JSON.parse(body.messages[0].content).journalNotes;
      assert.equal(request.body.includes('Loui Jay Naquines'), false);
      const e = dataset.examples.find(e => e.text === source); assert.ok(e);
      const findings = e.expected === 'none' ? [] : [{ category: e.expected === 'high' ? 'threat' : 'mistreatment', priority: e.expected,
        quote: source, reason: 'Synthetic transport fixture only.', immediateDangerQuote: e.expected === 'high' ? source : null }];
      return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
        content: [{ type: 'text', text: JSON.stringify({ version: 'workplace-concern-v1', findings }) }] });
    } };
  try { await work({ options, file, report, dir, calls: () => calls, setTime: t => { instant = t; } }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('reviewed evaluator is default-off without touching files or transport', async () => {
  assert.deepEqual(await run(), { status: 'disabled', attempted: 0 });
});
test('ten first-day attempts retain stop history; next-day run completes only the remaining two', async () => fixture(async f => {
  const first = await run(f.options); assert.equal(first.status, 'daily-limit'); assert.equal(first.completed, 10); assert.equal(f.calls(), 20);
  assert.equal(fs.existsSync(f.file + '.stopped'), true);
  assert.equal(fs.readdirSync(f.dir).filter(n => n.includes('.stopped.review-')).length, 10);
  f.setTime(base + 86400000);
  const second = await run(f.options); assert.equal(second.status, 'complete'); assert.equal(second.completed, 12); assert.equal(f.calls(), 24);
  assert.equal(fs.readFileSync(f.report, 'utf8').trim().split('\n').length, 12);
  const ledger = openPilotLedger(f.file);
  try { assert.deepEqual(ledger.snapshot(new Date(base)), { attempts: 10, reservedMicroUsd: 95600 });
    assert.deepEqual(ledger.snapshot(new Date(base + 86400000)), { attempts: 2, reservedMicroUsd: 19120 }); }
  finally { ledger.close(); }
}));
test('missing rearm refuses the existing stop without sharing', async () => fixture(async f => {
  await assert.rejects(run({ ...f.options, reviewedRearm: false })); assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.file + '.stopped'), true);
}));
test('invalid token count stops without generation and never refunds or retries', async () => fixture(async f => {
  let sends = 0;
  const options = { ...f.options, transport: async () => { sends++; return Response.json({ input_tokens: 12001 }); } };
  assert.equal((await run(options)).status, 'review-required'); assert.equal(sends, 1);
  assert.equal((await run(options)).status, 'review-required'); assert.equal(sends, 1);
  const ledger = openPilotLedger(f.file); try { assert.equal(ledger.snapshot(new Date(base)).attempts, 1); } finally { ledger.close(); }
}));
test('transport uncertainty and midnight stop sharing without exposing exception text', async () => fixture(async f => {
  const result = await run({ ...f.options, transport: async () => { f.setTime(base + 86400000); throw Error('DO-NOT-PRINT-SECRET'); } });
  assert.equal(result.status, 'review-required'); assert.equal(JSON.stringify(result).includes('DO-NOT-PRINT'), false);
  assert.equal(fs.readFileSync(f.report, 'utf8').includes('DO-NOT-PRINT'), false);
}));
test('a valid but disagreeing prediction is saved and stops for review, not rewritten to the label', async () => fixture(async f => {
  const real = f.options.transport;
  const result = await run({ ...f.options, transport: async (url, options) => url.endsWith('/count_tokens') ? real(url, options) : Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn',
    usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' }, content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }] }) });
  assert.equal(result.status, 'review-required'); const row = JSON.parse(fs.readFileSync(f.report, 'utf8').trim());
  assert.equal(row.id, 'en-threat'); assert.equal(row.predicted, 'none');
}));
test('successful counting across midnight cannot authorize generation', async () => fixture(async f => {
  let sends = 0;
  const result = await run({ ...f.options, transport: async () => { sends++; f.setTime(base + 86400000); return Response.json({ input_tokens: 600 }); } });
  assert.equal(result.status, 'review-required'); assert.equal(sends, 1);
  assert.equal(fs.existsSync(f.file + '.stopped'), true);
}));
test('a reservation with no result is marked uncertain without resending', async () => fixture(async f => {
  const { digest } = require('../workplaceJournalConsent');
  const ledger = openPilotLedger(f.file);
  try {
    fs.renameSync(f.file + '.stopped', f.file + '.stopped.seed-history');
    ledger.reserve(digest(['reviewed-evaluation-v1', 'c370bd361646fbebce8401b3807628a48548d0f759161942e929099219a614b9', 'en-threat']), 9560, new Date(base));
    ledger.stop();
  } finally { ledger.close(); }
  const result = await run(f.options); assert.equal(result.status, 'review-required'); assert.equal(f.calls(), 0);
  assert.equal(JSON.parse(fs.readFileSync(f.report, 'utf8').trim()).diagnostic, 'reserved-without-result');
}));
test('expired price review refuses before altering the stop or reserving', async () => fixture(async f => {
  f.setTime(Date.parse('2026-10-30T00:00:00Z'));
  await assert.rejects(run(f.options)); assert.equal(f.calls(), 0);
  assert.equal(fs.existsSync(f.file + '.stopped'), true);
  assert.equal(fs.readdirSync(f.dir).some(n => n.includes('.stopped.review-')), false);
}));
test('the exact parsed bytes must match approval even if a second read is approved', async () => fixture(async f => {
  const target = path.resolve(__dirname, '../../project-notes/WORKPLACE-MULTILINGUAL-REVIEW.json');
  const real = fs.readFileSync, changed = structuredClone(dataset); changed.examples[0].text = 'Unapproved synthetic replacement';
  let injected = false;
  fs.readFileSync = function(file, ...args) {
    if (!injected && typeof file === 'string' && path.resolve(file) === target) { injected = true; return Buffer.from(JSON.stringify(changed)); }
    return real.call(fs, file, ...args);
  };
  try { await assert.rejects(run(f.options)); assert.equal(f.calls(), 0); }
  finally { fs.readFileSync = real; }
}));
test('saved report is read only while holding its real ledger lock', async () => fixture(async f => {
  await run(f.options);
  const real = fs.readFileSync; let checked = false;
  fs.readFileSync = function(file, ...args) {
    if (file === f.report) { checked = true; assert.equal(fs.existsSync(f.file + '.lock'), true, 'report snapshot must be serialized with reservations'); }
    return real.call(fs, file, ...args);
  };
  try { assert.equal((await run(f.options)).status, 'daily-limit'); assert.equal(checked, true); }
  finally { fs.readFileSync = real; }
}));
test('the twelfth unavailable response is not reported as twelve evaluated predictions', async () => fixture(async f => {
  await run(f.options); f.setTime(base + 86400000);
  const real = f.options.transport;
  const result = await run({ ...f.options, transport: async (url, options) => {
    const source = JSON.parse(JSON.parse(options.body).messages[0].content).journalNotes;
    if (!url.endsWith('/count_tokens') && source === dataset.examples[11].text) throw Error('Synthetic lost generation acknowledgement');
    return real(url, options);
  } });
  assert.equal(result.completed, 11); assert.equal(result.fullDatasetEvaluated, false);
  assert.equal(result.remaining, 1); assert.equal(result.unattempted, 0); assert.equal(result.unavailable, 1);
}));
