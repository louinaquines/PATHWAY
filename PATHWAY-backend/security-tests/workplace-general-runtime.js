// Synthetic integration only: no credential loading, live transport defaults or server installation.
const { isDeepStrictEqual } = require('node:util');
const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const { digest, validId, DISCLOSURE_VERSION } = require('../workplaceJournalConsent');
const { PRICE_PROFILE, reserveCostMicroUsd } = require('../workplaceAnalysisPricing');
const failure = () => Object.assign(Error('Synthetic general analysis unavailable.'), { code: 'SYNTHETIC_UNAVAILABLE' });
function local(env) {
  const host = value => /^(127\.0\.0\.1|localhost):[1-9]\d{0,4}$/.test(value || '') && Number(value.split(':')[1]) <= 65535;
  return env?.PATHWAY_LOCAL_WORKFLOW === '1' && env.GOOGLE_CLOUD_PROJECT === 'demo-pathway-security'
    && env.NODE_ENV !== 'production' && !env.K_SERVICE && host(env.FIRESTORE_EMULATOR_HOST) && host(env.FIREBASE_AUTH_EMULATOR_HOST);
}
async function countValue(response) {
  if (!response?.ok) { await response?.body?.cancel().catch(() => {}); throw failure(); }
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > 32768) throw failure(); chunks.push(Buffer.from(value)); }
  } finally { await reader.cancel().catch(() => {}); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')).input_tokens;
  if (!Number.isSafeInteger(value) || value < 1 || value > 12000) throw failure();
  return value;
}
function createSyntheticGeneralAnalyzer({ source, enabled, env, countTransport, generationTransport, assertBound,
  claims, reserveLocal, stopLocal, assertLocal, clock } = {}) {
  if (enabled !== true || !local(env) || typeof source !== 'string'
    || ![countTransport, generationTransport, assertBound, reserveLocal, stopLocal, assertLocal, clock,
      claims?.claimStage, claims?.recordAcceptedCount].every(v => typeof v === 'function')) throw failure();
  assertLocal();
  let registered, used = false;
  const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey: 'SYNTHETIC-ONLY', allowedSources: [source], fetcher: generationTransport });
  return {
    prepare(notes) { if (notes !== source) throw failure(); registered = adapter.prepare(notes); return registered; },
    async analyze(prepared, { signal, assertReady } = {}) {
      let ticket;
      try {
        if (used || !registered || !isDeepStrictEqual(prepared, registered) || typeof assertReady !== 'function' || !signal) throw failure();
        used = true;
        const start = clock().getTime(); let last = start;
        const check = async () => {
          const checkClock = () => { const time = clock().getTime(); if (!Number.isFinite(time) || time < last || time - start >= 25000 || signal.aborted) throw failure(); last = time; };
          checkClock(); assertLocal(ticket); await assertReady(); await assertBound(prepared); assertLocal(ticket); checkClock();
        };
        await check(); await reserveLocal(prepared); await check();
        await claims.claimStage('count', prepared); await check();
        const body = JSON.parse(prepared.request);
        const payload = { model: body.model, system: body.system, messages: body.messages, thinking: body.thinking, output_config: body.output_config };
        const tokens = await countValue(await countTransport(payload, { signal }));
        await check(); await claims.recordAcceptedCount(prepared, tokens); await check();
        await claims.claimStage('generation', prepared);
        ticket = await stopLocal(); await check();
        const result = await adapter.analyze(prepared, { signal }); await check(); return result;
      } catch { try { await stopLocal(); } catch { /* No transport or retry is allowed if the stop cannot be persisted. */ } throw failure(); }
    },
  };
}
function createSyntheticStageClaims({ db, enabled, env, studentId, requestId, requestHash, day, sessionId, clock } = {}) {
  if (enabled !== true || !local(env) || db?.projectId !== 'demo-pathway-security' || !validId(studentId) || !validId(requestId)
    || !validId(sessionId) || !/^[a-f0-9]{64}$/.test(requestHash || '') || !/^\d{4}-\d\d-\d\d$/.test(day || '') || typeof clock !== 'function') throw failure();
  const selection = db.collection('workplaceSyntheticStageClaims').doc(`selection-${digest([studentId, requestId])}`);
  const receipt = db.collection('studentJournalReceipts').doc(digest([studentId, requestId]));
  const profileKey = digest(['model', 'currency', 'inputRate', 'outputRate', 'reviewedAt', 'expiresAt'].map(k => PRICE_PROFILE[k]));
  const time = () => { const value = clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== day) throw failure(); return value; };
  let armed = false;
  async function arm() {
    await db.runTransaction(async tx => {
      const old = await tx.get(selection), saved = await tx.get(receipt);
      if (old.exists || saved.exists) throw failure();
      tx.create(selection, { sessionId, requestHash, day, armedAt: time().toISOString() });
    }); armed = true;
  }
  async function check(prepared, action) {
    if (!armed || digest(prepared?.request) !== requestHash || reserveCostMicroUsd({ ...prepared, now: time() }) !== 9560) throw failure();
    const result = await db.runTransaction(async tx => {
      const selected = (await tx.get(selection)).data(), saved = (await tx.get(receipt)).data()?.result;
      if (!selected || selected.sessionId !== sessionId || selected.requestHash !== requestHash || selected.day !== day
        || !saved || saved.revision !== 1 || saved.analysisStatus !== 'queued' || !validId(saved.entryId)) throw failure();
      const jobId = digest([studentId, saved.entryId, 1]), ref = db.collection('workplaceJournalAnalysisJobs').doc(jobId);
      const job = (await tx.get(ref)).data(), control = (await tx.get(db.doc('workplaceJournalWorker/control'))).data();
      const budget = (await tx.get(db.doc(`workplaceAnalysisBudgetAttempts/${digest([jobId, 1])}`))).data();
      const brake = (await tx.get(db.doc(`workplaceJournalWorker/price-${profileKey}`))).data();
      const user = (await tx.get(db.doc(`users/${studentId}`))).data();
      const consent = (await tx.get(db.doc(`workplaceJournalConsents/${studentId}`))).data();
      const source = (await tx.get(db.doc(`users/${studentId}/logbook/${saved.entryId}`))).data();
      const company = user && validId(user.companyId) ? (await tx.get(db.doc(`companies/${user.companyId}`))).data() : null;
      const live = data => typeof data?.leaseOwner === 'string' && Number.isFinite(Date.parse(data.leaseUntil)) && Date.parse(data.leaseUntil) > time().getTime();
      if (!job || job.studentId !== studentId || job.entryId !== saved.entryId || job.sourceRevision !== 1 || job.state !== 'sending' || job.attempts !== 1
        || !live(job) || !live(control) || control.leaseOwner !== job.leaseOwner || (brake && brake.blocked !== false)
        || !budget || budget.day !== day || budget.reservedMicroUsd !== 9560
        || !user || user.role !== 'student' || user.accountApproved !== true || user.passwordChangeRequired === true || user.clearanceStatus === 'cleared'
        || user.preDeploymentStatus !== 'approved' || user.placementStatus !== 'approved' || !company || company.active === false || company.status === 'inactive'
        || !consent?.granted || consent.revision !== job.consentRevision || consent.disclosureVersion !== DISCLOSURE_VERSION || job.disclosureVersion !== DISCLOSURE_VERSION
        || !source || source.sourceRevision !== 1 || digest(source.rawNotes) !== job.sourceHash || source.createdAt !== job.createdAt
        || !Number.isFinite(Date.parse(job.createdAt)) || Date.parse(job.createdAt) < Date.parse(selected.armedAt)) throw failure();
      const { prepareWorkplaceClaudeRequest } = require('../workplaceClaudeAdapter');
      if (digest(prepareWorkplaceClaudeRequest(source.rawNotes).request) !== requestHash) throw failure();
      const claimRef = db.collection('workplaceSyntheticStageClaims').doc(digest([jobId, 1]));
      const prior = (await tx.get(claimRef)).data();
      const fingerprint = digest([jobId, job.sourceHash, job.consentRevision, job.disclosureVersion, requestHash, profileKey, day]);
      if (prior && (prior.fingerprint !== fingerprint || prior.sessionId !== sessionId || prior.owner !== job.leaseOwner)) throw failure();
      if (action) action(tx, claimRef, prior, { fingerprint, sessionId, owner: job.leaseOwner, day });
      return { leaseUntil: Math.min(Date.parse(job.leaseUntil), Date.parse(control.leaseUntil)) };
    });
    if (time().getTime() >= result.leaseUntil) throw failure();
  }
  return { arm, assertBound: prepared => check(prepared),
    claimStage: (stage, prepared) => check(prepared, (tx, ref, prior, binding) => {
      if (stage === 'count') { if (prior) throw failure(); tx.create(ref, { ...binding, stage: 'count' }); }
      else if (stage === 'generation' && prior?.stage === 'accepted' && Number.isSafeInteger(prior.inputTokens) && prior.inputTokens >= 1 && prior.inputTokens <= 12000) tx.update(ref, { stage: 'generation' });
      else throw failure();
    }),
    recordAcceptedCount: (prepared, tokens) => check(prepared, (tx, ref, prior) => {
      if (prior?.stage !== 'count' || !Number.isSafeInteger(tokens) || tokens < 1 || tokens > 12000) throw failure();
      tx.update(ref, { stage: 'accepted', inputTokens: tokens, requestHash });
    }),
  };
}
function createSyntheticLocalAccounting({ file, attemptId, sessionId, day, clock } = {}) {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  if (typeof file !== 'string' || !validId(attemptId) || !validId(sessionId) || typeof clock !== 'function') throw failure();
  const parent = fs.realpathSync(path.dirname(path.resolve(file))), temporary = fs.realpathSync(os.tmpdir());
  const relative = path.relative(temporary, parent);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw failure();
  if (fs.existsSync(`${file}.stopped`) || fs.existsSync(`${file}.synthetic-stop`)) throw failure();
  const ledger = require('./workplace-claude-pilot').openPilotLedger(file);
  const marker = `${file}.synthetic-stop`, expected = JSON.stringify({ attemptId, sessionId, day }), ticket = Symbol('synthetic-stop');
  let issued = false, reserved = false;
  function assertLocal(value) {
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || now.toISOString().slice(0, 10) !== day) throw failure();
    ledger.snapshot(now);
    if (ledger.isStopped() || fs.existsSync(marker)) {
      if (!issued || value !== ticket || !ledger.isStopped() || fs.readFileSync(marker, 'utf8') !== expected) throw failure();
    }
  }
  function stopLocal() {
    try {
      if (!fs.existsSync(marker)) { const fd = fs.openSync(marker, 'wx', 0o600); try { fs.writeFileSync(fd, expected); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      if (fs.readFileSync(marker, 'utf8') !== expected) throw failure();
    } finally { ledger.stop(); }
    issued = true; return ticket;
  }
  return { assertLocal, stopLocal,
    reserveLocal(prepared) { assertLocal(); if (reserved || ledger.reserve(attemptId, reserveCostMicroUsd({ ...prepared, now: clock() }), clock()).status !== 'reserved') throw failure(); reserved = true; },
    snapshot: () => ledger.snapshot(new Date(`${day}T12:00:00Z`)), isStopped: () => ledger.isStopped(), close: () => ledger.close(),
  };
}
module.exports = { createSyntheticGeneralAnalyzer, createSyntheticStageClaims, createSyntheticLocalAccounting };
