const { validId, digest } = require('../workplaceJournalConsent');
const { PRICE_PROFILE, reserveCostMicroUsd } = require('../workplaceAnalysisPricing');
const { fixtures } = require('./workplace-claude-fixtures');
function controlledDispatchAllowed({ db, env = {}, window, now, priceProfile = PRICE_PROFILE }) {
  const local = value => /^(127\.0\.0\.1|localhost):[1-9]\d{0,4}$/.test(value || '') && Number(value.split(':')[1]) <= 65535;
  const utc = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z');
  if (env.PATHWAY_WORKPLACE_CONTROLLED_CLAUDE !== '1' || env.PATHWAY_LOCAL_WORKFLOW !== '1'
    || env.PATHWAY_WORKPLACE_FAKE_DISPATCH === '1' || env.GOOGLE_CLOUD_PROJECT !== 'demo-pathway-security'
    || db?.projectId !== 'demo-pathway-security' || !local(env.FIRESTORE_EMULATOR_HOST) || !local(env.FIREBASE_AUTH_EMULATOR_HOST)
    || env.NODE_ENV === 'production' || env.K_SERVICE || !window || !validId(window.studentId) || !validId(window.requestId)
    || !fixtures.some(f => f.notes === window.source) || !utc(window.startAt) || !utc(window.endAt)
    || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const start = Date.parse(window.startAt), end = Date.parse(window.endAt);
  if (end <= start || end - start > 900000 || now.getTime() < start || now.getTime() >= end) return false;
  try { reserveCostMicroUsd({ model: PRICE_PROFILE.model, inputTokenUpperBound: 14000, maxOutputTokens: 1024, now, profile: priceProfile }); }
  catch { return false; }
  return true;
}
function createControlledDispatch({ db, env = {}, window, clock = () => new Date(), apiKey, ledger, fetcher = fetch,
  runRecovery, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  // Copy configuration so a caller cannot change the approved identity while a wake is pending.
  window = window && { ...window }; env = { ...env };
  const allowed = value => {
    try { return controlledDispatchAllowed({ db, env, window, now: value === undefined ? clock() : value }) && typeof apiKey === 'string' && !!apiKey.trim(); }
    catch { return false; }
  };
  let started = false, stopped = false, armed = false, active, timer, pending = false, lastTime = -Infinity;
  const unavailable = () => ({ status: 'unavailable' });
  function time() {
    const value = clock();
    if (stopped || !allowed(value)) throw Error('Controlled window unavailable');
    if (value.getTime() < lastTime) throw Error('Controlled clock unavailable');
    lastTime = value.getTime(); return value;
  }
  const ref = () => db.collection('workplaceControlledWindows').doc(digest([window.studentId, window.requestId]));
  const fingerprint = () => digest([window.studentId, window.requestId, window.source, window.startAt, window.endAt]);
  const receiptRef = () => db.collection('studentJournalReceipts').doc(digest([window.studentId, window.requestId]));
  function checkWindow(data, now) {
    if (!data || data.fingerprint !== fingerprint() || data.state !== 'armed'
      || !Number.isFinite(Date.parse(data.armedAt)) || !Number.isFinite(Date.parse(data.observedAt))
      || Date.parse(data.observedAt) > now.getTime()) throw Error('Controlled window unavailable');
  }
  async function arm() {
    if (ledger.isStopped()) throw Error('Pilot stopped');
    ledger.snapshot(time()); // Validate existing continuity before touching the queue.
    await db.runTransaction(async tx => {
      const saved = await tx.get(ref()), receipt = await tx.get(receiptRef()), now = time();
      if (saved.exists) { checkWindow(saved.data(), now); return; }
      if (receipt.exists) throw Error('Historical receipt refused');
      tx.create(ref(), { fingerprint: fingerprint(), state: 'armed', armedAt: now.toISOString(), observedAt: now.toISOString() });
    });
    armed = true;
  }
  async function target(claim = false) {
    return db.runTransaction(async tx => {
      const saved = await tx.get(ref()), receipt = await tx.get(receiptRef());
      const now = time(); checkWindow(saved.data(), now);
      if (!receipt.exists) return null;
      const result = receipt.data().result;
      if (!result || !validId(result.entryId) || result.revision !== 1 || result.analysisStatus !== 'queued') throw Error('Receipt unavailable');
      const jobId = digest([window.studentId, result.entryId, 1]);
      const job = await tx.get(db.collection('workplaceJournalAnalysisJobs').doc(jobId));
      const source = await tx.get(db.collection('users').doc(window.studentId).collection('logbook').doc(result.entryId));
      const j = job.data(), entry = source.data(), created = Date.parse(j?.createdAt);
      if (!j || !entry || j.studentId !== window.studentId || j.entryId !== result.entryId || j.sourceRevision !== 1
        || j.sourceHash !== digest(window.source) || entry.rawNotes !== window.source || entry.sourceRevision !== 1
        || entry.createdAt !== j.createdAt || !Number.isFinite(created) || created < Date.parse(saved.data().armedAt)
        || created < Date.parse(window.startAt) || created >= Date.parse(window.endAt)
        || (claim ? j.state !== 'sending' || j.attempts !== 1 : !['queued', 'leased'].includes(j.state) || j.attempts !== 0)) throw Error('Target unavailable');
      const fresh = time(); checkWindow(saved.data(), fresh);
      tx.update(ref(), { observedAt: fresh.toISOString(), ...(claim ? { state: 'spent', jobId } : {}) });
      return jobId;
    });
  }
  async function execute(recover = true) {
    let claimed = false;
    try {
      time();
      if (!ledger || ledger.isStopped()) throw Error('Pilot unavailable');
      if (!armed) await arm();
      if (recover && runRecovery) { try { await runRecovery(); } catch { /* Bounded cleanup is independent of saved submission. */ } }
      const jobId = await target();
      if (!jobId) return { status: 'waiting' };
      const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
      const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
      let authorize, prepared;
      const attemptDay = time().toISOString().slice(0, 10);
      const sameDay = () => { if (time().toISOString().slice(0, 10) !== attemptDay) throw Error('Accounting day changed'); };
      const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey, allowedSources: [window.source], fetcher: async (url, options) => {
        if (claimed || ledger.isStopped()) throw Error('Pilot unavailable');
        await authorize(); sameDay();
        if (await target(true) !== jobId) throw Error('Target unavailable');
        claimed = true;
        const now = time(), cost = reserveCostMicroUsd({ ...prepared, now });
        if (ledger.reserve(digest(['controlled-window-v1', window.studentId, window.requestId]), cost, now).status !== 'reserved') throw Error('Allowance unavailable');
        // Durable stop precedes HTTP: even a crash/lost response cannot silently re-arm this pilot.
        ledger.stop();
        await authorize(); sameDay();
        if (options.signal?.aborted) throw Error('Send cancelled');
        return fetcher(url, options);
      } });
      const analyzer = {
        prepare: notes => adapter.prepare(notes),
        analyze: (value, options) => { prepared = value; authorize = options.assertReady; return adapter.analyze(value, options); },
      };
      const result = await createWorkplaceJournalWorker({ db, enabled: true, analyzer, clock,
        onAccountingUncertain: async () => {
          // Separate stores cannot commit atomically; block either durable boundary before returning.
          try { await ref().update({ state: 'blocked' }); } finally { ledger.stop(); }
        } }).runBatch({ limit: 1, jobId });
      if (result.status === 'busy') return { status: 'busy', processed: 0 };
      const state = (await db.collection('workplaceJournalAnalysisJobs').doc(jobId).get()).data()?.state;
      return { status: state === 'processed' ? 'complete' : state === 'queued' ? 'waiting' : 'unavailable', processed: result.processed };
    } catch {
      // An ineligible competing wake must not revoke another worker's valid live lease.
      stop();
      return unavailable();
    } finally {
      if (claimed) { try { ledger.stop(); } catch {} stop(); }
    }
  }
  function wake() {
    if (!started || stopped) return Promise.resolve(unavailable());
    if (!allowed()) { stop(); return Promise.resolve(unavailable()); }
    if (active) { pending = true; return active; }
    active = Promise.resolve().then(async () => {
      let result;
      for (let pass = 0; pass < 4 && !stopped; pass++) {
        pending = false; result = await execute(pass === 0);
        if (!pending) break;
      }
      return result || unavailable();
    }).finally(() => {
      active = undefined;
      // Retain a wake received during the last bounded pass; never broaden the target.
      if (pending && !stopped) { pending = false; queueMicrotask(wake); }
    });
    return active;
  }
  function stop() { stopped = true; pending = false; if (timer !== undefined) { clearIntervalFn(timer); timer = undefined; } }
  return {
    start() {
      if (started) return wake();
      if (stopped || !allowed()) return Promise.resolve(unavailable());
      started = true;
      const result = wake();
      return result.then(value => {
        if (armed && !stopped && timer === undefined) { timer = setIntervalFn(wake, 900000); timer?.unref?.(); }
        return value;
      });
    }, wake, stop,
  };
}
module.exports = { controlledDispatchAllowed, createControlledDispatch };
