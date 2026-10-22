const { randomUUID } = require('node:crypto');
const { reserveWorkplaceAttempt } = require('./workplaceAnalysisBudget');
const { reserveCostMicroUsd, PRICE_PROFILE } = require('./workplaceAnalysisPricing');
const { validId, digest, DISCLOSURE_VERSION } = require('./workplaceJournalConsent');
const { validateConcernDecision } = require('./workplaceConcernDetector');
const { planConcernOutcome, applyConcernOutcome } = require('./workplaceConcernCases');
const LEASE_MS = 90000, RETRY_MS = 15 * 60000;
const terminal = new Set(['processed', 'cancelled', 'unavailable']);
// Control plane only: no live provider, results/evidence, route, or dispatcher is installed.
function createWorkplaceJournalWorker({ db, enabled, analyzer, clock = () => new Date(), priceProfile = PRICE_PROFILE, onAccountingUncertain } = {}) {
  const now = () => { const value = clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw Error('Clock unavailable'); return value; };
  const pricing = prepared => reserveCostMicroUsd({ ...prepared, now: now(), profile: priceProfile });
  const profileKey = digest(['model', 'currency', 'inputRate', 'outputRate', 'reviewedAt', 'expiresAt'].map(key => priceProfile?.[key]));
  const guardRef = () => db.collection('workplaceJournalWorker').doc(`price-${profileKey}`);
  const controlRef = () => db.collection('workplaceJournalWorker').doc('control');
  const live = (data, owner, time) => data?.leaseOwner === owner && Number.isFinite(Date.parse(data.leaseUntil)) && Date.parse(data.leaseUntil) > time;
  async function sourceValid(tx, job) {
    if (!validId(job.studentId) || !validId(job.entryId) || !Number.isSafeInteger(job.sourceRevision) || job.sourceRevision < 1
      || !Number.isSafeInteger(job.consentRevision) || job.consentRevision < 1 || job.disclosureVersion !== DISCLOSURE_VERSION
      || !/^[a-f0-9]{64}$/.test(job.sourceHash || '')) return null;
    const profile = await tx.get(db.collection('users').doc(job.studentId));
    const user = profile.exists && profile.data();
    if (!user || user.role !== 'student' || user.accountApproved !== true || user.passwordChangeRequired === true
      || user.clearanceStatus === 'cleared' || user.preDeploymentStatus !== 'approved' || user.placementStatus !== 'approved'
      || !validId(user.companyId)) return null;
    const company = await tx.get(db.collection('companies').doc(user.companyId));
    if (!company.exists || company.data().active === false || company.data().status === 'inactive') return null;
    const consent = await tx.get(db.collection('workplaceJournalConsents').doc(job.studentId));
    if (!consent.exists || consent.data().granted !== true || consent.data().revision !== job.consentRevision || consent.data().disclosureVersion !== job.disclosureVersion) return null;
    const source = await tx.get(db.collection('users').doc(job.studentId).collection('logbook').doc(job.entryId));
    const entry = source.exists && source.data();
    return entry && typeof entry.rawNotes === 'string' && entry.rawNotes.trim() && entry.rawNotes.length <= 8000
      && entry.sourceRevision === job.sourceRevision && digest(entry.rawNotes) === job.sourceHash ? entry.rawNotes : null;
  }
  async function ready(tx, ref, owner) {
    const time = now().getTime();
    const control = await tx.get(controlRef()), snap = await tx.get(ref), guard = await tx.get(guardRef());
    if (enabled !== true || !control.exists || !snap.exists || !live(control.data(), owner, time) || !live(snap.data(), owner, time)) return null;
    if (guard.exists && guard.data().blocked !== false) return { job: snap.data(), control: control.data(), invalid: 'unavailable' };
    const notes = await sourceValid(tx, snap.data());
    const freshTime = now().getTime();
    if (!live(control.data(), owner, freshTime) || !live(snap.data(), owner, freshTime)) return null;
    return { job: snap.data(), control: control.data(), notes, invalid: notes === null ? 'cancelled' : null };
  }
  async function finish(ref, owner, state, extra = {}, decision) {
    return db.runTransaction(async tx => {
      const check = await ready(tx, ref, owner);
      if (!check) return false;
      const plan = !check.invalid && decision ? await planConcernOutcome({ db, tx, jobId: ref.id, job: check.job, decision, now: now() }) : null;
      if (!live(check.job, owner, now().getTime()) || !live(check.control, owner, now().getTime())) return false;
      applyConcernOutcome(tx, plan);
      tx.update(ref, { ...extra, state: check.invalid || state, leaseOwner: null, leaseUntil: null,
        ...(check.invalid ? { usage: null } : {}), updatedAt: now().toISOString() });
      return true;
    });
  }
  async function processJob(ref, owner) {
    const claim = await db.runTransaction(async tx => {
      const control = await tx.get(controlRef()), snap = await tx.get(ref), time = now().getTime();
      if (!control.exists || !live(control.data(), owner, time) || !snap.exists) return null;
      const job = snap.data();
      if (terminal.has(job.state)) return null;
      if (!['queued', 'retry', 'leased', 'sending'].includes(job.state) || !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > 2) {
        tx.update(ref, { state: 'unavailable' }); return null;
      }
      if (job.dueAt && !Number.isFinite(Date.parse(job.dueAt))) { tx.update(ref, { state: 'unavailable' }); return null; }
      if (job.dueAt && Date.parse(job.dueAt) > time) return null;
      if (['leased', 'sending'].includes(job.state) && Number.isFinite(Date.parse(job.leaseUntil)) && Date.parse(job.leaseUntil) > time) return null;
      if (job.state === 'sending' || job.attempts >= 2) { tx.update(ref, { state: 'unavailable', leaseOwner: null, leaseUntil: null }); return null; }
      const notes = await sourceValid(tx, job);
      if (notes === null) { tx.update(ref, { state: 'cancelled' }); return null; }
      const leaseUntil = new Date(time + LEASE_MS).toISOString();
      tx.update(ref, { state: 'leased', leaseOwner: owner, leaseUntil });
      tx.update(controlRef(), { leaseUntil });
      return { notes, attempt: job.attempts + 1 };
    });
    if (!claim) return false;
    let prepared, cost;
    try {
      const raw = analyzer.prepare(claim.notes);
      if (!raw || Object.keys(raw).length !== 5 || !['model','inputTokenUpperBound','maxOutputTokens','features','request'].every(key => Object.hasOwn(raw,key))
        || typeof raw.request !== 'string' || !raw.request || Buffer.byteLength(raw.request) > 65536) throw Error('Invalid adapter preparation');
      prepared = Object.freeze({ ...raw, features: Object.freeze({ ...raw.features }) });
      cost = pricing(prepared);
    } catch { await finish(ref, owner, 'unavailable'); return true; }
    const preflight = await db.runTransaction(tx => ready(tx, ref, owner));
    if (!preflight || preflight.invalid) { if (preflight) await finish(ref, owner, preflight.invalid); return true; }
    let reservation;
    try { reservation = await reserveWorkplaceAttempt({ db, enabled, attemptId: digest([ref.id, claim.attempt]), now: now(), reservedMicroUsd: cost }); }
    catch {
      if (onAccountingUncertain) await onAccountingUncertain();
      await finish(ref, owner, 'unavailable'); return true;
    }
    if (reservation.status === 'daily-limit') {
      const nextDay = new Date(now()); nextDay.setUTCHours(24, 0, 0, 0);
      await finish(ref, owner, 'queued', { dueAt: nextDay.toISOString(), delayReason: 'daily-limit' }); return true;
    }
    if (reservation.status !== 'reserved') { await finish(ref, owner, 'unavailable', { attempts: claim.attempt }); return true; }
    const sending = await db.runTransaction(async tx => {
      const check = await ready(tx, ref, owner);
      if (!check) return false;
      if (check.invalid) { tx.update(ref, { state: check.invalid, leaseOwner: null, leaseUntil: null }); return false; }
      pricing(prepared);
      tx.update(ref, { state: 'sending', attempts: claim.attempt }); return true;
    });
    if (!sending) return true;
    // Database commit latency can consume the lease after its callback has returned.
    const beforeSend = await db.runTransaction(tx => ready(tx, ref, owner));
    if (!beforeSend || beforeSend.invalid) { if (beforeSend) await finish(ref, owner, beforeSend.invalid); return true; }
    if (!live(beforeSend.job, owner, now().getTime())) return true;
    let timer;
    try {
      // Adapter is trusted, synthetic and injected here. It must honor cancellation in a real integration.
      const controller = new AbortController();
      const result = await Promise.race([
        analyzer.analyze(prepared, { signal: controller.signal, assertReady: async () => {
          const check = await db.runTransaction(tx => ready(tx, ref, owner));
          if (!check || check.invalid || controller.signal.aborted) throw Error('Send authorization unavailable');
          const fresh = now().getTime();
          if (!live(check.job, owner, fresh) || !live(check.control, owner, fresh)) throw Error('Send authorization expired');
          pricing(prepared);
        } }),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('Uncertain timeout')); }, 25000); }),
      ]);
      if (!result || ![1,2].includes(Object.keys(result).length) || Object.keys(result).some(k => !['usage','decision'].includes(k)) || !result.usage || Object.keys(result.usage).length !== 2
        || !['inputTokens','outputTokens'].every(k => Number.isSafeInteger(result.usage[k]) && result.usage[k] >= 0)) throw Error('Invalid adapter output');
      const usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
      if (usage.inputTokens > prepared.inputTokenUpperBound || usage.outputTokens > prepared.maxOutputTokens) {
        // Budget safety brake is allowed even for a stale owner; no source/result data is written.
        await guardRef().set({ blocked: true, reason: 'usage-bound-exceeded', updatedAt: now().toISOString() });
        await finish(ref, owner, 'unavailable');
      } else {
        const decision = Object.hasOwn(result, 'decision') ? validateConcernDecision(claim.notes, result.decision) : undefined;
        await finish(ref, owner, 'processed', { usage }, decision);
      }
    } catch (error) {
      const retry = error.code === 'TRANSIENT' && claim.attempt < 2;
      await finish(ref, owner, retry ? 'retry' : 'unavailable', retry ? { dueAt: new Date(now().getTime() + RETRY_MS).toISOString() } : {});
    } finally { clearTimeout(timer); }
    return true;
  }
  async function runBatch({ limit = 5, jobId } = {}) {
    if (enabled !== true) return { status: 'disabled', processed: 0 };
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw Error('Batch limit must be 1–5.');
    if (jobId !== undefined && !validId(jobId)) throw Error('Invalid target job.');
    try { pricing({ model: PRICE_PROFILE.model, inputTokenUpperBound: 1, maxOutputTokens: 1 }); }
    catch { return { status: 'unavailable', processed: 0 }; }
    const owner = randomUUID(); let processed = 0;
    try {
      const guard = await guardRef().get();
      if (guard.exists && guard.data().blocked !== false) return { status: 'unavailable', processed: 0 };
      const lease = await db.runTransaction(async tx => {
        const snap = await tx.get(controlRef()), data = snap.exists ? snap.data() : {}, time = now().getTime();
        if (data.leaseOwner && !Number.isFinite(Date.parse(data.leaseUntil))) throw Error('Worker lease unavailable');
        if (data.leaseOwner && Date.parse(data.leaseUntil) > time) return null;
        if (data.cursor != null && !validId(data.cursor)) throw Error('Worker cursor unavailable');
        tx.set(controlRef(), { cursor: data.cursor || null, leaseOwner: owner, leaseUntil: new Date(time + LEASE_MS).toISOString() });
        return { cursor: data.cursor || null };
      });
      if (!lease) return { status: 'busy', processed: 0 };
      const base = db.collection('workplaceJournalAnalysisJobs').orderBy('__name__');
      let page;
      if (jobId !== undefined) {
        const target = await db.collection('workplaceJournalAnalysisJobs').doc(jobId).get();
        page = { docs: target.exists ? [target] : [] };
      } else {
        page = await (lease.cursor ? base.startAfter(lease.cursor) : base).limit(limit).get();
        if (page.empty && lease.cursor) page = await base.limit(limit).get();
      }
      for (const doc of page.docs) {
        const brake = await guardRef().get();
        if (brake.exists && brake.data().blocked !== false) return { status: 'unavailable', processed };
        if (await processJob(doc.ref, owner)) processed++;
        const advance = await db.runTransaction(async tx => {
          const snap = await tx.get(controlRef());
          if (!snap.exists || !live(snap.data(), owner, now().getTime())) return false;
          tx.update(controlRef(), { cursor: doc.id, leaseUntil: new Date(now().getTime() + LEASE_MS).toISOString() }); return true;
        });
        if (!advance) break;
      }
      return { status: 'complete', processed };
    } catch { return { status: 'unavailable', processed }; }
    finally {
      await db.runTransaction(async tx => {
        const snap = await tx.get(controlRef());
        if (snap.exists && snap.data().leaseOwner === owner) tx.update(controlRef(), { leaseOwner: null, leaseUntil: null });
      }).catch(() => {});
    }
  }
  return { runBatch };
}
module.exports = { createWorkplaceJournalWorker };
