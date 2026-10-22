const { test,before,after,beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { concernFixture } = require('./concern-fixture');
const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { installPilotFlow,pilotFlow,runPilot,openPilotLedger } = require('./workplace-claude-pilot');
const { fixtures } = require('./workplace-claude-fixtures');
let f;
before(async () => { f = await concernFixture(installPilotFlow); }); after(async () => { if (f) await f.close(); });
beforeEach(async () => { await f.reset(); await f.db.doc('workplaceJournalConsents/c-student').delete(); });
function response(fixture,patch = {}) {
  const findings = fixture.expected === 'none' ? [] : [{ category: 'threat',priority: fixture.expected,quote: fixture.evidence,reason: 'Synthetic potential concern for human review.',immediateDangerQuote: fixture.expected === 'high' ? fixture.evidence : null }];
  return Response.json({ model: 'claude-haiku-5-5',stop_reason: 'end_turn',usage: { input_tokens: 600,output_tokens: 150 },content: [{ type: 'text',text: JSON.stringify({ version: 'workplace-concern-v1',findings }) }],...patch });
}
function adapter(fetcher) { return createWorkplaceClaudeAdapter({ enabled: true,apiKey: 'SYNTHETIC',allowedSources: fixtures.map(v => v.notes),fetcher }); }
const run = a => createWorkplaceJournalWorker({ db: f.db,enabled: true,analyzer: a,clock: f.clock }).runBatch();
test('real consent/submission HTTP endpoints lead to original-evidence case and private notice', async () => {
  const flow = pilotFlow(f), fixture = fixtures[0], entry = await flow.submit(fixture); let calls = 0;
  await run(adapter(async () => { calls++; return response(fixture); }));
  assert.equal(calls,1); assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${entry.jobId}`).get()).data().state,'processed');
  assert.deepEqual(await flow.inspect(entry.entryId),{ priority: 'high',noticeDelivered: true });
  const saved = await f.case(); assert.equal(saved.data().findings[0].quote,fixture.evidence);
  await f.db.doc('sections/c-section').update({ coordinatorId: 'c-other' });
  assert.equal((await f.post(`/coordinator/workplace-concerns/${saved.id}/detail`)).status,403);
});
test('decline and post-submit withdrawal prevent sharing, while no-flag success creates no case', async () => {
  const fixture = fixtures[3]; let calls = 0;
  const submit = () => f.post('/student/journals',{ requestId: 'decline',rawNotes: fixture.notes,refined: fixture.notes,aiRefined: false,hours: 8 },'c-student');
  assert.equal((await submit()).data.analysisStatus,'not-enabled');
  const flow = pilotFlow(f), entry = await flow.submit(fixture);
  const a = adapter(async () => { calls++; return response(fixture); }); await run(a); assert.equal(calls,1); assert.equal(await flow.inspect(entry.entryId),null);
  await flow.submit(fixtures[0]);
  const current = await f.post('/student/journal-analysis-consent/read',{},'c-student');
  await f.post('/student/journal-analysis-consent',{ granted: false,disclosureVersion: 'workplace-journal-consent-v1',expectedRevision: current.data.revision,requestId: 'withdraw' },'c-student');
  await run(a); assert.equal(calls,1);
});
test('raw edits and lease expiry after real adapter response discard outcomes without another paid request', async () => {
  for (const change of ['raw','lease']) {
    await f.reset(); const flow = pilotFlow(f), fixture = fixtures[0], entry = await flow.submit(fixture); let calls = 0;
    const a = adapter(async () => { calls++;
      if (change === 'raw') await f.db.doc(`users/c-student/logbook/${entry.entryId}`).update({ rawNotes: 'Edited legacy source' });
      else f.setTime('2026-10-22T12:02:00Z');
      return response(fixture);
    });
    await run(a); assert.equal(calls,1); assert.equal(await flow.inspect(entry.entryId),null);
    assert.notEqual((await f.db.doc(`workplaceJournalAnalysisJobs/${entry.jobId}`).get()).data().state,'processed');
  }
});
test('pilot stops on first invalid provider result and a restart never repeats its reserved attempt', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pathway-pilot-flow-')), file = path.join(dir,'ledger.jsonl'); let ledger;
  try {
    ledger = openPilotLedger(file); let calls = 0;
    let result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SYNTHETIC',ledger,flow: pilotFlow(f),fetcher: async () => { calls++; return response(fixtures[0],{ content: [{ type: 'text',text: 'invalid' }] }); } });
    assert.equal(calls,1); assert.equal(result.status,'stopped'); assert.equal(result.results.filter(r => r.status === 'untested').length,8);
    ledger.close(); ledger = null; await f.reset(); ledger = openPilotLedger(file);
    result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SYNTHETIC',ledger,flow: pilotFlow(f),fetcher: async () => { calls++; return new Response('error',{ status: 401 }); } });
    assert.equal(result.results[0].status,'untested'); assert.equal(calls,1);
  } finally { ledger?.close(); fs.rmSync(dir,{ recursive: true,force: true }); }
});
test('pilot binds payment to target job and leaves unrelated eligible queue work alone', async () => {
  await f.db.doc('users/c-student/logbook/entry').update({ rawNotes: fixtures[0].notes });
  await f.job('000-unrelated',{ sourceHash: require('../workplaceJournalConsent').digest(fixtures[0].notes) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pathway-target-')); let ledger;
  try {
    ledger = openPilotLedger(path.join(dir,'ledger')); let calls = 0;
    const result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SYNTHETIC',ledger,flow: pilotFlow(f),fetcher: async (_url,options) => {
      calls++; const notes = JSON.parse(JSON.parse(options.body).messages[0].content).journalNotes;
      return response(fixtures.find(v => v.notes === notes));
    } });
    assert.equal(result.status,'complete'); assert.equal(calls,9);
    assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/000-unrelated').get()).data().state,'queued');
  } finally { ledger?.close(); fs.rmSync(dir,{ recursive: true,force: true }); }
});
test('midnight between submission and send stops before payment and persists stop', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pathway-midnight-')); let ledger;
  try {
    ledger = openPilotLedger(path.join(dir,'ledger')); const flow = pilotFlow(f); let calls = 0;
    const result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SYNTHETIC',ledger,
      flow: { ...flow,submit: async (...args) => { const entry = await flow.submit(...args); f.setTime('2026-10-23T00:00:00Z'); return entry; } },
      fetcher: async () => { calls++; return response(fixtures[0]); } });
    assert.equal(result.status,'stopped'); assert.equal(calls,0); assert.equal(ledger.isStopped(),true);
  } finally { ledger?.close(); fs.rmSync(dir,{ recursive: true,force: true }); }
});
test('local accounting failure prevents HTTP and usage overrun persists the worker safety brake', async () => {
  let calls = 0;
  const ledger = { has: () => false,reserve: () => { throw Error('Synthetic accounting failure'); } };
  const result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SYNTHETIC',ledger,flow: pilotFlow(f),fetcher: () => { calls++; assert.fail('HTTP'); } });
  assert.equal(result.status,'stopped'); assert.equal(calls,0);
  await f.reset(); await pilotFlow(f).submit(fixtures[0]);
  await run(adapter(async () => response(fixtures[0],{ usage: { input_tokens: 14001,output_tokens: 1 } })));
  const guards = await f.db.collection('workplaceJournalWorker').get(); assert.ok(guards.docs.some(d => d.data().blocked));
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size,0);
});
test('pilot preserves safe adapter diagnostics before worker catch and separates post-validation workflow failure', async () => {
  for (const kind of ['http','transport','output','workflow','overrun']) {
    await f.reset(); const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pathway-diagnostic-')); let ledger;
    try {
      ledger = openPilotLedger(path.join(dir,'ledger')); const flow = pilotFlow(f);
      const result = await runPilot({ enabled: true,db: f.db,clock: f.clock,apiKey: 'SECRET KEY',ledger,
        flow: kind === 'workflow' ? { ...flow,inspect: async () => { throw Error('SECRET DATABASE'); } } : flow,
        fetcher: async () => {
          if (kind === 'http') return new Response('SECRET BODY',{ status: 403 });
          if (kind === 'transport') throw Error('SECRET NETWORK');
          if (kind === 'output') return new Response('SECRET INVALID JSON');
          return response(fixtures[0],kind === 'overrun' ? { usage: { input_tokens: 14001,output_tokens: 1 } } : {});
        } });
      const d = result.results[0].diagnostic;
      assert.equal(d.stage,kind === 'output' ? 'response-validation' : kind === 'overrun' ? 'usage-bound' : kind);
      if (kind === 'http') assert.equal(d.httpStatus,403);
      if (kind === 'workflow') assert.equal(d.providerValidated,true);
      if (kind === 'overrun') assert.equal(d.inputBoundExceeded,true);
      assert.ok(!JSON.stringify(result).includes('SECRET')); assert.equal(result.requests,1); assert.equal(ledger.isStopped(),true);
    } finally { ledger?.close(); fs.rmSync(dir,{ recursive: true,force: true }); }
  }
});
