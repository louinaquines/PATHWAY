// Uninstalled: explicit dependencies only; no environment, scheduler, routes or default network transport.
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { digest, validId, DISCLOSURE_VERSION } = require('./workplaceJournalConsent');
const { prepareWorkplaceClaudeRequest } = require('./workplaceClaudeAdapter');
const { createGeneralJournalProvider } = require('./workplaceGeneralProvider');
const { createWorkplaceJournalWorker } = require('./workplaceJournalWorker');
const { PRICE_PROFILE, reserveCostMicroUsd } = require('./workplaceAnalysisPricing');
const { LIMITS } = require('./workplaceRealUsePolicy');
const unavailable = () => Object.assign(Error('Hosted analysis unavailable.'), { code: 'HOSTED_UNAVAILABLE' });
function createHostedWorkplaceRuntime({ db, enabled = false, successfulNextJob = false, readinessGate = false, gate, apiKey, transport, clock = () => new Date() } = {}) {
  let continuation;
  const active = enabled === true && db && typeof apiKey === 'string' && apiKey.trim() && typeof transport === 'function';
  const control = () => db.doc('workplaceHostedControl/control');
  const time = () => { const n = clock(); if (!(n instanceof Date) || !Number.isFinite(n.getTime())) throw unavailable(); return n; };
  const usable = c => c?.enabled === true && c.stopped === false && validId(c.epoch)
    && Number.isFinite(Date.parse(c.notBefore)) && Date.parse(c.notBefore) <= time().getTime();
  async function wake({ jobId } = {}) {
    if (!active) return { status: 'disabled', processed: 0 };
    if (!validId(jobId)) throw unavailable(); // Exact target only; never scan historical journals.
    let admission;
    if (readinessGate === true) {
      if (successfulNextJob === true || !require('./workplaceReadinessGate').isWorkplaceReadinessGate(gate)) throw unavailable();
      admission = await gate.assertExecution({ jobId });
    }
    const initialSnapshot = await control().get(), initial = initialSnapshot.data();
    if (readinessGate !== true && initial?.readinessProtocol != null) return { status: 'stopped', processed: 0 };
    if (successfulNextJob === true && (initial?.operatingMode !== 'successful-next-job-v1'
      || initial.stopProtocol !== 'operator-revision-v1' || !Number.isSafeInteger(initial.operatorRevision)
      || initial.operatorRevision < 0)) return { status: 'stopped', processed: 0 };
    const permit = continuation;
    continuation = undefined;
    const continued = successfulNextJob === true && initial?.enabled === true && initial.stopped === true
      && permit?.version?.isEqual(initialSnapshot.updateTime) && permit.session === initial.stopSession
      && permit.day === time().toISOString().slice(0, 10) && time().getTime() < permit.deadline;
    if (!usable(initial) && !continued) {
      // A stopped process may quarantine expired sending work, never reclaim or dispatch it.
      let processed = 0;
      if (initial?.enabled === true && initial.stopped === true && validId(initial.epoch)) {
        processed = await db.runTransaction(async tx => {
          const c = (await tx.get(control())).data();
          const ref = db.doc(`workplaceJournalAnalysisJobs/${jobId}`), job = (await tx.get(ref)).data();
          const lease = (await tx.get(db.doc('workplaceJournalWorker/control'))).data();
          const n = time().getTime();
          if (c?.enabled !== true || c.stopped !== true || c.epoch !== initial.epoch || c.stopSession !== initial.stopSession
            || job?.state !== 'sending' || !Number.isSafeInteger(job.attempts) || job.attempts < 1
            || !Number.isFinite(Date.parse(job.leaseUntil)) || Date.parse(job.leaseUntil) > n
            || (lease?.leaseOwner && (!Number.isFinite(Date.parse(lease.leaseUntil)) || Date.parse(lease.leaseUntil) > n))) return 0;
          tx.update(ref, { state: 'unavailable', leaseOwner: null, leaseUntil: null, updatedAt: time().toISOString() });
          return 1;
        });
      }
      return { status: 'stopped', processed };
    }
    const session = admission?.session || randomUUID(), day = time().toISOString().slice(0, 10), ticket = Symbol('continuation');
    let issued = false, selected, owner, prepared, ownedVersion, leaseDeadline, stopCalls = 0, uncertain = false;
    // Worker finalization errors may be caught internally; they still forbid releasing the interlock.
    const workerDb = successfulNextJob !== true && readinessGate !== true ? db : new Proxy(db, { get(target, key) {
      if (key === 'runTransaction') return async callback => {
        try { return await target.runTransaction(callback); } catch (error) { uncertain = true; throw error; }
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    const profileKey = digest(['model','currency','inputRate','outputRate','reviewedAt','expiresAt'].map(k => PRICE_PROFILE[k]));
    const attemptRef = db.doc(`workplaceHostedAttempts/${digest([jobId, 1])}`);
    const bound = c => c?.enabled === true && c.epoch === initial.epoch && c.notBefore === initial.notBefore
      && (successfulNextJob !== true || (c.operatingMode === 'successful-next-job-v1'
        && c.stopProtocol === 'operator-revision-v1' && c.operatorRevision === initial.operatorRevision));
    async function stop() {
      stopCalls++;
      if (readinessGate === true) {
        if (stopCalls !== 1) { gate.invalidate(); throw unavailable(); }
        await gate.assertExecution({ jobId }); issued = true; return ticket;
      }
      if (successfulNextJob === true && stopCalls === 1) {
        if (issued) return ticket;
        // The acknowledged CAS write version fences even same-value operator stops.
        const result = await control().update({ stopped: true, stopSession: session, stopJobId: jobId,
          stoppedAt: time().toISOString() }, { lastUpdateTime: initialSnapshot.updateTime });
        ownedVersion = result.writeTime;
        issued = true; return ticket;
      }
      await db.runTransaction(async tx => {
        const c = (await tx.get(control())).data();
        if (!bound(c) || (c.stopped !== false && c.stopSession !== session)) throw unavailable();
        tx.update(control(), { stopped: true, stopSession: session, stoppedAt: time().toISOString() });
      });
      issued = true; return ticket;
    }
    async function check(value, action, finalized = false) {
      if (readinessGate === true) await gate.assertExecution({ jobId });
      if (!prepared || !isDeepStrictEqual(value, prepared) || time().toISOString().slice(0, 10) !== day
        || reserveCostMicroUsd({ ...prepared, now: time() }) !== LIMITS.reservationMicroUsd) throw unavailable();
      const expiry = await db.runTransaction(async tx => {
        const controlSnapshot = await tx.get(control()), c = controlSnapshot.data();
        const job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data();
        const lease = (await tx.get(db.doc('workplaceJournalWorker/control'))).data();
        const budget = (await tx.get(db.doc(`workplaceAnalysisBudgetAttempts/${digest([jobId, 1])}`))).data();
        const brake = (await tx.get(db.doc(`workplaceJournalWorker/price-${profileKey}`))).data();
        const prior = (await tx.get(attemptRef)).data();
        const live = data => data?.leaseOwner === owner && Date.parse(data.leaseUntil) > time().getTime();
        if (!bound(c) || !(c.stopped === false || (issued && c.stopped === true && c.stopSession === session))
          || (successfulNextJob === true && !(issued ? ownedVersion : initialSnapshot.updateTime)?.isEqual(controlSnapshot.updateTime))
          || !job || !selected || digest([job.studentId, job.entryId, job.sourceHash, job.sourceRevision, job.consentRevision, job.disclosureVersion]) !== selected
          || job.attempts !== 1 || (finalized ? job.state !== 'processed' || job.leaseOwner !== null || job.leaseUntil !== null
            || lease?.leaseOwner || !Number.isFinite(leaseDeadline) || time().getTime() >= leaseDeadline
            || !Number.isFinite(Date.parse(job.updatedAt)) || Date.parse(job.updatedAt) >= leaseDeadline
            : job.state !== 'sending' || !live(job) || !live(lease))
          || Date.parse(job.createdAt) < Date.parse(initial.notBefore) || !Number.isFinite(Date.parse(job.createdAt))
          || Date.parse(job.createdAt) > time().getTime() || (brake && brake.blocked !== false)
          || budget?.day !== day || budget.reservedMicroUsd !== LIMITS.reservationMicroUsd) throw unavailable();
        const user = (await tx.get(db.doc(`users/${job.studentId}`))).data();
        const consent = (await tx.get(db.doc(`workplaceJournalConsents/${job.studentId}`))).data();
        const entry = (await tx.get(db.doc(`users/${job.studentId}/logbook/${job.entryId}`))).data();
        const company = validId(user?.companyId) ? (await tx.get(db.doc(`companies/${user.companyId}`))).data() : null;
        if (user?.role !== 'student' || user.accountApproved !== true || user.passwordChangeRequired === true || user.clearanceStatus === 'cleared'
          || user.preDeploymentStatus !== 'approved' || user.placementStatus !== 'approved' || !company || company.active === false || company.status === 'inactive'
          || consent?.granted !== true || consent.revision !== job.consentRevision || consent.disclosureVersion !== DISCLOSURE_VERSION
          || job.disclosureVersion !== DISCLOSURE_VERSION || entry?.sourceRevision !== job.sourceRevision || digest(entry.rawNotes) !== job.sourceHash
          || !isDeepStrictEqual(prepareWorkplaceClaudeRequest(entry.rawNotes), prepared)) throw unavailable();
        const fingerprint = digest([selected, prepared.request, profileKey, day, initial.epoch]);
        if (prior && (prior.fingerprint !== fingerprint || prior.session !== session || prior.owner !== owner)) throw unavailable();
        if (finalized && (prior?.stage !== 'generation' || prior.day !== day || prior.reservedMicroUsd !== LIMITS.reservationMicroUsd
          || !job.usage || !['inputTokens', 'outputTokens'].every(k => Number.isSafeInteger(job.usage[k]) && job.usage[k] >= 0)
          || job.usage.inputTokens > prepared.inputTokenUpperBound || job.usage.outputTokens > prepared.maxOutputTokens
          || stopCalls !== 1 || uncertain || !issued || c.stopped !== true || c.stopJobId !== jobId)) throw unavailable();
        const binding = { fingerprint, session, owner, day, reservedMicroUsd: LIMITS.reservationMicroUsd };
        if (finalized && (time().toISOString().slice(0, 10) !== day || time().getTime() >= leaseDeadline
          || reserveCostMicroUsd({ ...prepared, now: time() }) !== LIMITS.reservationMicroUsd)) throw unavailable();
        if (action) await action(tx, prior, binding);
        return finalized ? leaseDeadline : Math.min(Date.parse(job.leaseUntil), Date.parse(lease.leaseUntil));
      });
      if (time().getTime() >= expiry || time().toISOString().slice(0, 10) !== day) throw unavailable();
      if (!finalized) leaseDeadline = expiry;
      if (readinessGate === true) await gate.assertExecution({ jobId });
    }
    const authority = {
      assertReady: p => check(p),
      assertContinuation: async (t, p) => { if (issued && stopCalls > 0 && t !== ticket) throw unavailable(); await check(p); },
      reserve: p => check(p, async (tx, prior, binding) => {
        if (prior) throw unavailable();
        const ref = db.doc(`workplaceHostedDays/${day}`), snapshot = await tx.get(ref);
        const totals = snapshot.exists ? snapshot.data() : { attempts: 0, reservedMicroUsd: 0 };
        if (!Number.isSafeInteger(totals.attempts) || totals.attempts < 0 || totals.attempts >= LIMITS.attemptsPerUtcDay
          || !Number.isSafeInteger(totals.reservedMicroUsd) || totals.reservedMicroUsd < 0
          || totals.reservedMicroUsd > LIMITS.reservedMicroUsdPerUtcDay - LIMITS.reservationMicroUsd) throw unavailable();
        tx.set(ref, { attempts: totals.attempts + 1, reservedMicroUsd: totals.reservedMicroUsd + LIMITS.reservationMicroUsd });
        tx.create(attemptRef, { ...binding, stage: 'reserved' });
      }),
      claim: (stage, p) => check(p, (tx, prior) => {
        if (stage === 'count' && prior?.stage === 'reserved') tx.update(attemptRef, { stage: 'count' });
        else if (stage === 'generation' && prior?.stage === 'accepted' && Number.isSafeInteger(prior.inputTokens)
          && prior.inputTokens >= 1 && prior.inputTokens <= LIMITS.countAdmission) tx.update(attemptRef, { stage: 'generation' });
        else throw unavailable();
      }),
      acceptCount: (p, inputTokens) => check(p, (tx, prior) => {
        if (prior?.stage !== 'count' || !Number.isSafeInteger(inputTokens) || inputTokens < 1 || inputTokens > LIMITS.countAdmission) throw unavailable();
        tx.update(attemptRef, { stage: 'accepted', inputTokens });
      }), stop,
    };
    const analyzer = {
      prepare(notes) { prepared = prepareWorkplaceClaudeRequest(notes); return prepared; },
      async analyze(value, options) {
        const job = (await db.doc(`workplaceJournalAnalysisJobs/${jobId}`).get()).data();
        if (!validId(job?.studentId) || !validId(job.entryId) || !validId(job.leaseOwner)) throw unavailable();
        owner = job.leaseOwner;
        selected = digest([job.studentId, job.entryId, job.sourceHash, job.sourceRevision, job.consentRevision, job.disclosureVersion]);
        const entry = (await db.doc(`users/${job.studentId}/logbook/${job.entryId}`).get()).data();
        const provider = createGeneralJournalProvider({ enabled: true, apiKey, transport, source: entry?.rawNotes,
          disclosureVersion: DISCLOSURE_VERSION, authority, clock });
        provider.prepare(entry?.rawNotes);
        return provider.analyze(value, options);
      },
    };
    try {
      if (continued) {
        const write = await control().update({ stopped: true, stopSession: session, stopJobId: jobId,
          stoppedAt: time().toISOString() }, { lastUpdateTime: initialSnapshot.updateTime });
        ownedVersion = write.writeTime; issued = true;
      }
      const result = await createWorkplaceJournalWorker({ db: workerDb, enabled: true, analyzer, clock, onAccountingUncertain: stop }).runBatch({ limit: 1, jobId });
      if (readinessGate === true) {
        if (uncertain) { gate.invalidate(); return { status: 'unavailable', processed: 0 }; }
        if (stopCalls === 0 && !issued) return result;
        if (stopCalls !== 1 || !issued) { gate.invalidate(); return { status: 'unavailable', processed: 0 }; }
        await gate.finishSuccess({ jobId });
      }
      if (successfulNextJob === true && issued) {
        // Never durably reopen sharing: only an acknowledged read permits same-process handoff.
        await check(prepared, undefined, true);
        continuation = { version: ownedVersion, session, day, deadline: leaseDeadline };
      }
      return result;
    } catch { if (readinessGate === true) gate.invalidate(); else await stop().catch(() => {}); return { status: 'unavailable', processed: 0 }; }
  }
  return { wake };
}
module.exports = { createHostedWorkplaceRuntime };
