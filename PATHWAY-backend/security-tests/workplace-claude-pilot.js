// Explicit paid test entry only. Importing this module never loads secrets or sends requests.
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { fixtures } = require('./workplace-claude-fixtures');
const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { localConcernEnabled } = require('../workplaceConcernCases');
const { digest } = require('../workplaceJournalConsent');
const error = code => Object.assign(Error('Workplace paid pilot unavailable.'),{ code });
function safeAdapterDiagnostic(failure) {
  const stages = { CLAUDE_PROVIDER: 'http',CLAUDE_TRANSPORT_UNCERTAIN: 'transport',CLAUDE_OUTPUT: 'response-validation',
    CLAUDE_DISABLED: 'preparation',CLAUDE_INPUT: 'preparation',CLAUDE_SOURCE: 'preparation' };
  const code = Object.hasOwn(stages,failure?.code || '') ? failure.code : 'CLAUDE_UNKNOWN';
  const out = { stage: stages[code] || 'unknown',code }, details = failure?.diagnostic;
  if (code === 'CLAUDE_PROVIDER' && Number.isInteger(details?.httpStatus) && details.httpStatus >= 100 && details.httpStatus <= 599) out.httpStatus = details.httpStatus;
  if (code === 'CLAUDE_OUTPUT') {
    out.reason = ['response-body','invalid-json','model-mismatch','stop-reason','usage-invalid','content-shape','decision-invalid'].includes(details?.reason) ? details.reason : 'unknown';
    if (details?.stopReason !== undefined) out.stopReason = ['end_turn','max_tokens','stop_sequence','tool_use','pause_turn','refusal','model_context_window_exceeded'].includes(details.stopReason) ? details.stopReason : 'unknown';
  }
  return out;
}
function openPilotLedger(file) {
  const lock = `${file}.lock`, marker = `${file}.started`, mirror = `${file}.continuity`, stopped = `${file}.stopped`, owner = randomUUID();
  const write = (target,value,flags) => { const fd = fs.openSync(target,flags,0o600); try { fs.writeFileSync(fd,value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
  try { write(lock,owner,'wx'); } catch { throw error('PILOT_LOCKED'); }
  if (!fs.existsSync(file) && !fs.existsSync(marker)) {
    write(marker,owner,'wx'); const initial = JSON.stringify({ type: 'init',id: owner })+'\n';
    write(mirror,initial,'wx'); write(file,initial,'wx');
  }
  function rows() {
    try {
      if (!fs.existsSync(marker) || !fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 65536) throw Error();
      const raw = fs.readFileSync(file,'utf8');
      if (!raw.endsWith('\n') || fs.lstatSync(mirror).isSymbolicLink() || raw !== fs.readFileSync(mirror,'utf8')) throw Error();
      const lines = raw.trimEnd().split('\n').map(line => JSON.parse(line)), header = lines.shift();
      if (!header || Object.keys(header).length !== 2 || header.type !== 'init' || header.id !== fs.readFileSync(marker,'utf8')) throw Error();
      let last = -Infinity; const ids = new Set(), totals = new Map();
      for (const row of lines) {
        const time = Date.parse(row.at);
        if (Object.keys(row).length !== 5 || row.type !== 'reserve' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.attemptId || '') || ids.has(row.attemptId)
          || !Number.isFinite(time) || time < last || row.day !== new Date(time).toISOString().slice(0,10)
          || !Number.isSafeInteger(row.microUsd) || row.microUsd < 1 || row.microUsd > 100000) throw Error();
        ids.add(row.attemptId); last = time;
        const t = totals.get(row.day) || { attempts: 0,reservedMicroUsd: 0 }; t.attempts++; t.reservedMicroUsd += row.microUsd;
        if (t.attempts > 10 || t.reservedMicroUsd > 100000) throw Error(); totals.set(row.day,t);
      }
      return { ids,totals,last };
    } catch { throw error('PILOT_LEDGER_INVALID'); }
  }
  rows();
  function instant(now) { if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw error('PILOT_CLOCK'); return now.toISOString().slice(0,10); }
  return {
    isStopped: () => fs.existsSync(stopped),
    stop() { if (!fs.existsSync(stopped)) write(stopped,'Explicit review required before any continuation.\n','wx'); },
    has: id => rows().ids.has(id),
    snapshot(now) { return rows().totals.get(instant(now)) || { attempts: 0,reservedMicroUsd: 0 }; },
    reserve(attemptId,microUsd,now) {
      const day = instant(now), saved = rows();
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(attemptId || '') || !Number.isSafeInteger(microUsd) || microUsd < 1 || microUsd > 100000 || now.getTime() < saved.last) throw error('PILOT_RESERVATION_INVALID');
      if (saved.ids.has(attemptId)) return { status: 'already-reserved' };
      const t = saved.totals.get(day) || { attempts: 0,reservedMicroUsd: 0 };
      if (t.attempts >= 10 || t.reservedMicroUsd + microUsd > 100000) return { status: 'daily-limit' };
      if (fs.existsSync(stopped)) throw error('PILOT_STOPPED');
      const receipt = JSON.stringify({ type: 'reserve',attemptId,at: now.toISOString(),day,microUsd })+'\n';
      // Write continuity first: interruption between the fsyncs fails closed on restart.
      write(mirror,receipt,'a'); write(file,receipt,'a');
      return { status: 'reserved' };
    },
    close() { if (fs.readFileSync(lock,'utf8') !== owner) throw error('PILOT_LOCK_CHANGED'); fs.unlinkSync(lock); },
  };
}
async function runPilot({ enabled,db,apiKey,ledger,flow,fetcher = fetch,clock = () => new Date(),onResult = () => {} } = {}) {
  if (!localConcernEnabled(db,enabled)) return { status: 'disabled',results: [],requests: 0 };
  if (!apiKey || !ledger || !flow) throw error('PILOT_CONFIG');
  let requests = 0, stopped = ledger.isStopped?.() === true; const results = [];
  for (const fixture of fixtures) {
    const attemptTime = clock(), day = attemptTime.toISOString().slice(0,10);
    const attemptId = digest(['workplace-pilot-v1',day,fixture.id]);
    const base = { id: fixture.id,language: fixture.language,expected: fixture.expected };
    if (stopped || ledger.has(attemptId)) {
      const row = { ...base,status: stopped ? 'untested' : 'previously_reserved' }; results.push(row); onResult(row); continue;
    }
    let outcome, shared = false, diagnostic, stage = 'submission', providerValidated = false;
    const adapter = createWorkplaceClaudeAdapter({ enabled: true,apiKey,allowedSources: [fixture.notes],
      fetcher: async (url,options) => {
        try {
          if (shared) throw error('PILOT_DUPLICATE_SEND');
          const sendTime = clock();
          if (sendTime.toISOString().slice(0,10) !== day || sendTime < attemptTime) throw error('PILOT_DAY_CHANGED');
          if (ledger.reserve(attemptId,9560,sendTime).status !== 'reserved') throw error('PILOT_ALLOWANCE');
        } catch { diagnostic = { stage: 'accounting',code: 'PILOT_RESERVATION_FAILED' }; throw error('PILOT_RESERVATION_FAILED'); }
        shared = true; requests++; return fetcher(url,options);
      } });
    const analyzer = {
      prepare: notes => { try { return adapter.prepare(notes); } catch (failure) { diagnostic = safeAdapterDiagnostic(failure); throw failure; } },
      analyze: async (p,options) => {
        try {
          outcome = await adapter.analyze(p,options);
          const inputBoundExceeded = outcome.usage.inputTokens > p.inputTokenUpperBound, outputBoundExceeded = outcome.usage.outputTokens > p.maxOutputTokens;
          if (inputBoundExceeded || outputBoundExceeded) diagnostic = { stage: 'usage-bound',code: 'CLAUDE_USAGE_BOUND',inputBoundExceeded,outputBoundExceeded };
          else providerValidated = Boolean(outcome.decision);
          return outcome;
        } catch (failure) { diagnostic ||= safeAdapterDiagnostic(failure); throw failure; }
      },
    };
    let row;
    try {
      const entry = await flow.submit(fixture,{ day });
      stage = 'worker';
      const worker = createWorkplaceJournalWorker({ db,enabled: true,analyzer,clock });
      let job;
      for (let page = 0; page < 4; page++) {
        await worker.runBatch({ limit: 1,jobId: entry.jobId }); job = (await db.collection('workplaceJournalAnalysisJobs').doc(entry.jobId).get()).data();
        if (!job || ['processed','cancelled','unavailable'].includes(job.state)) break;
      }
      if (job?.state !== 'processed' || !outcome?.decision) throw error('PILOT_ANALYSIS_UNAVAILABLE');
      const findings = outcome.decision.findings, observed = findings.some(f => f.priority === 'high') ? 'high' : findings.length ? 'normal' : 'none';
      stage = 'workflow';
      const review = await flow.inspect(entry.entryId);
      if ((observed === 'none' && review !== null) || (observed !== 'none' && (!review || review.priority !== observed || !review.noticeDelivered))) throw error('PILOT_WORKFLOW');
      row = { ...base,status: observed === fixture.expected ? 'passed' : 'mismatch',observed,usage: outcome.usage,reservedMicroUsd: 9560,decision: outcome.decision };
    } catch {
      ledger.stop?.(); stopped = true; row = { ...base,status: 'unavailable',code: 'PILOT_STOPPED',requestAttempted: shared,
        diagnostic: diagnostic || { stage,code: stage === 'submission' ? 'PILOT_SUBMISSION_FAILED' : stage === 'workflow' ? 'PILOT_WORKFLOW_FAILED' : 'PILOT_WORKER_UNAVAILABLE',providerValidated } };
    }
    results.push(row); onResult(row);
  }
  return { status: stopped ? 'stopped' : 'complete',results,requests };
}
function installPilotFlow(options) {
  const { installWorkplaceJournalConsent } = require('../workplaceJournalConsent');
  const { installStudentJournalSubmission } = require('../studentJournalSubmission');
  const { installWorkplaceConcernReview } = require('../workplaceConcernReview');
  installWorkplaceJournalConsent(options); installStudentJournalSubmission(options); installWorkplaceConcernReview(options);
}
function pilotFlow(f) {
  return {
    async submit(fixture,{ day = f.clock().toISOString().slice(0,10) } = {}) {
      const current = await f.post('/student/journal-analysis-consent/read',{},'c-student');
      if (current.status !== 200) throw error('PILOT_CONSENT');
      if (!current.data.granted) {
        const choice = await f.post('/student/journal-analysis-consent',{ granted: true,disclosureVersion: 'workplace-journal-consent-v1',expectedRevision: current.data.revision,requestId: `pilot-consent-${current.data.revision}` },'c-student');
        if (choice.status !== 200) throw error('PILOT_CONSENT');
      }
      const saved = await f.post('/student/journals',{ requestId: `pilot-${day}-${fixture.id}`,
        rawNotes: fixture.notes,refined: fixture.notes,aiRefined: false,hours: 8 },'c-student');
      if (saved.status !== 200 || saved.data.analysisStatus !== 'queued') throw error('PILOT_SUBMISSION');
      return { entryId: saved.data.entryId,jobId: digest(['c-student',saved.data.entryId,saved.data.revision]) };
    },
    async inspect(entryId) {
      const matches = await f.db.collection('workplaceConcernCases').where('entryId','==',entryId).limit(2).get();
      if (matches.empty) return null; if (matches.size !== 1) throw error('PILOT_WORKFLOW');
      const saved = matches.docs[0], result = await f.post(`/coordinator/workplace-concerns/${saved.id}/detail`);
      const notices = await f.post('/coordinator/workplace-concerns/notices/list');
      if (result.status !== 200 || notices.status !== 200) throw error('PILOT_ACCESS');
      return { priority: result.data.priority,noticeDelivered: notices.data.records.some(n => n.caseId === saved.id) };
    },
  };
}
async function main() {
  if (!process.argv.includes('--paid-synthetic') || process.env.PATHWAY_CONCERN_PAID_PILOT !== '1') throw error('PILOT_DISABLED');
  const { concernFixture } = require('./concern-fixture');
  require('dotenv').config({ path: path.resolve(__dirname,'../.env'),quiet: true });
  if (!process.env.ANTHROPIC_API_KEY?.trim()) throw error('PILOT_KEY_MISSING');
  const f = await concernFixture(installPilotFlow,{ liveClock: true });
  if (!localConcernEnabled(f.db,true)) { await f.close(); throw error('PILOT_LOCAL_ONLY'); }
  let ledger;
  try {
    // Preserve budget collections and old receipts; only seed fixed demo identities.
    await f.seedPilot();
    ledger = openPilotLedger(path.resolve(__dirname,'../../output/release/workplace-claude-pilot-reservations.jsonl'));
    const file = path.resolve(__dirname,`../../output/release/workplace-claude-pilot-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl`);
    fs.writeFileSync(file,'',{ flag: 'wx' });
    const result = await runPilot({ enabled: true,db: f.db,apiKey: process.env.ANTHROPIC_API_KEY,ledger,flow: pilotFlow(f),clock: f.clock,
      onResult: row => { fs.appendFileSync(file,JSON.stringify(row)+'\n'); console.log(JSON.stringify({ id: row.id,status: row.status,observed: row.observed,diagnostic: row.diagnostic })); } });
    console.log(JSON.stringify({ status: result.status,requests: result.requests,allowance: ledger.snapshot(f.clock()),report: file,syntheticOnly: true,productionWrites: 0 }));
    ledger.close(); ledger = null;
    if (result.status !== 'complete' || result.results.some(row => row.status !== 'passed')) process.exitCode = 1;
  } finally { await f.close(); }
}
if (require.main === module) main().catch(e => { console.error(JSON.stringify({ error: ['PILOT_DISABLED','PILOT_KEY_MISSING','PILOT_LOCKED','PILOT_LEDGER_INVALID'].includes(e.code) ? e.code : 'PILOT_UNAVAILABLE',secretsPrinted: false })); process.exitCode = 1; });
module.exports = { openPilotLedger,runPilot,installPilotFlow,pilotFlow };
