// Uninstalled split-protocol ownership/hand-off gate. No transport, operator rearm, migration or scheduler.
const { randomUUID, createHash } = require('node:crypto');
const { digest, validId, DISCLOSURE_VERSION } = require('./workplaceJournalConsent');
const { prepareWorkplaceClaudeRequest } = require('./workplaceClaudeAdapter');
const { reserveCostMicroUsd, PRICE_PROFILE } = require('./workplaceAnalysisPricing');
const gates = new WeakSet();
const deny = () => Error('Workplace readiness unavailable.');
const version = snapshot => `${snapshot.updateTime?.seconds}:${snapshot.updateTime?.nanoseconds}`;
const hashId = value => createHash('sha256').update(value).digest('hex');
function createWorkplaceReadinessGate({ enabled = false, db, clock = () => new Date() } = {}) {
  let owned, busy = false;
  const now = () => { const value = clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw deny(); return value; };
  const operatorRef = () => db.doc('workplaceHostedControl/control');
  const interlockRef = () => db.doc('workplaceHostedInterlock/control');
  function allowed(c) {
    return c?.enabled === true && c.stopped === false && c.readinessProtocol === 'split-operator-interlock-v1'
      && c.stopProtocol === 'operator-revision-v1' && Number.isSafeInteger(c.operatorRevision) && c.operatorRevision >= 0
      && c.operatingMode == null && validId(c.epoch) && Number.isFinite(Date.parse(c.notBefore)) && Date.parse(c.notBefore) <= now().getTime();
  }
  async function source(tx, job) {
    if (!job || !validId(job.studentId) || !validId(job.entryId) || !Number.isSafeInteger(job.sourceRevision) || job.sourceRevision < 1
      || !Number.isSafeInteger(job.consentRevision) || job.consentRevision < 1 || job.disclosureVersion !== DISCLOSURE_VERSION
      || !/^[a-f0-9]{64}$/.test(job.sourceHash || '')) return null;
    const user = (await tx.get(db.doc(`users/${job.studentId}`))).data();
    const consent = (await tx.get(db.doc(`workplaceJournalConsents/${job.studentId}`))).data();
    const entry = (await tx.get(db.doc(`users/${job.studentId}/logbook/${job.entryId}`))).data();
    const company = validId(user?.companyId) ? (await tx.get(db.doc(`companies/${user.companyId}`))).data() : null;
    if (user?.role !== 'student' || user.accountApproved !== true || user.passwordChangeRequired === true || user.clearanceStatus === 'cleared'
      || user.preDeploymentStatus !== 'approved' || user.placementStatus !== 'approved' || !company || company.active === false || company.status === 'inactive'
      || consent?.granted !== true || consent.revision !== job.consentRevision || consent.disclosureVersion !== DISCLOSURE_VERSION
      || entry?.sourceRevision !== job.sourceRevision || typeof entry.rawNotes !== 'string' || digest(entry.rawNotes) !== job.sourceHash) return null;
    const time = now();
    try {
      const prepared = prepareWorkplaceClaudeRequest(entry.rawNotes);
      if (reserveCostMicroUsd({ ...prepared, now: time }) !== 9560) return null;
    } catch { return null; }
    return digest([job.studentId, job.entryId, job.sourceRevision, job.sourceHash, job.consentRevision, job.disclosureVersion, job.createdAt]);
  }
  async function assertExecution({ jobId } = {}) {
    if (enabled !== true || !owned || owned.kind || owned.jobId !== jobId) throw deny();
    const permit = owned;
    try {
      await db.runTransaction(async tx => {
        const operator = await tx.get(operatorRef()), interlock = (await tx.get(interlockRef())).data();
        const job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data();
        if (!allowed(operator.data()) || version(operator) !== permit.operatorVersion || interlock?.state !== 'held'
          || interlock.nonce !== permit.nonce || interlock.generation !== permit.generation || interlock.jobId !== jobId
          || interlock.session !== permit.session || interlock.deadline !== permit.deadline || interlock.day !== permit.day) throw deny();
        if (await source(tx, job) !== permit.fingerprint || now().toISOString().slice(0, 10) !== permit.day
          || now().getTime() >= Date.parse(permit.deadline)) throw deny();
      });
      if (now().toISOString().slice(0, 10) !== permit.day || now().getTime() >= Date.parse(permit.deadline)) throw deny();
      return Object.freeze({ session: permit.session });
    } catch { owned = undefined; throw deny(); }
  }
  const gate = {
    async claimWake({ jobId, wakeId } = {}) {
      if (enabled !== true || !validId(jobId) || !validId(wakeId) || busy || (owned && !['success', 'unsent'].includes(owned.kind))) return false;
      busy = true;
      const permit = owned; owned = undefined;
      const nonce = randomUUID(), session = randomUUID();
      try {
        const time = now(), day = time.toISOString().slice(0, 10), deadline = new Date(time.getTime() + 90000).toISOString();
        const result = await db.runTransaction(async tx => {
          const operator = await tx.get(operatorRef()), interlock = (await tx.get(interlockRef())).data();
          if (!allowed(operator.data())) return null;
          const bootstrap = interlock?.state === 'bootstrap-idle' && interlock.generation === 0
            && Object.keys(interlock).length === 2;
          const transfer = permit?.kind === 'success' && permit.jobId !== jobId && interlock?.state === 'held'
            && interlock.nonce === permit.nonce && interlock.generation === permit.generation
            && interlock.session === permit.session && interlock.jobId === permit.jobId
            && permit.operatorVersion === version(operator) && permit.day === day && now().getTime() < Date.parse(permit.deadline);
          const recovery = permit?.kind === 'unsent' && permit.jobId === jobId && interlock?.state === 'unsent-wait'
            && interlock.nonce === permit.nonce && interlock.generation === permit.generation
            && interlock.session === permit.session && interlock.jobId === jobId && interlock.dueAt === permit.dueAt
            && permit.operatorVersion === version(operator);
          if ((!bootstrap && !transfer && !recovery) || !Number.isSafeInteger(interlock.generation) || interlock.generation >= Number.MAX_SAFE_INTEGER) return null;
          const wakeRef = db.doc(`workplaceWakeReceipts/${hashId(wakeId)}`), deliveryRef = db.doc(`workplaceWakeJobs/${hashId(jobId)}`);
          const wake = await tx.get(wakeRef), delivery = await tx.get(deliveryRef);
          const job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data();
          const worker = (await tx.get(db.doc('workplaceJournalWorker/control'))).data();
          if (wake.exists || (delivery.exists && !recovery) || (recovery && (!delivery.exists || delivery.data().state !== 'safe-unsent'
            || delivery.data().wakeId !== permit.wakeId || (job?.dueAt ?? null) !== permit.dueAt))
            || job?.state !== 'queued' || job.attempts !== 0 || job.leaseOwner != null || job.leaseUntil != null
            || (worker?.leaseOwner && (!Number.isFinite(Date.parse(worker.leaseUntil)) || Date.parse(worker.leaseUntil) > now().getTime()))
            || !Number.isFinite(Date.parse(job.createdAt)) || Date.parse(job.createdAt) < Date.parse(operator.data().notBefore)
            || Date.parse(job.createdAt) > now().getTime() || (job.dueAt != null && (!Number.isFinite(Date.parse(job.dueAt)) || Date.parse(job.dueAt) > now().getTime()))) return null;
          for (const collection of ['workplaceAnalysisBudgetAttempts', 'workplaceHostedAttempts']) for (const attempt of [1, 2]) {
            if ((await tx.get(db.doc(`${collection}/${digest([jobId, attempt])}`))).exists) return null;
          }
          const fingerprint = await source(tx, job);
          if (!fingerprint) return null;
          if (recovery && fingerprint !== permit.fingerprint) return null;
          if (transfer && (now().toISOString().slice(0, 10) !== permit.day || now().getTime() >= Date.parse(permit.deadline))) return null;
          if (now().toISOString().slice(0, 10) !== day || now().getTime() >= Date.parse(deadline)) return null;
          const binding = { state: 'held', jobId, wakeId, session, nonce, generation: interlock.generation + 1, day, deadline, fingerprint,
            operatorVersion: version(operator), operatorRevision: operator.data().operatorRevision,
            epoch: operator.data().epoch, notBefore: operator.data().notBefore };
          const receipt = { jobId, wakeId, state: 'claimed', claimedAt: now().toISOString(), deliveryProtocol: 'split-operator-interlock-v1' };
          tx.create(wakeRef, receipt);
          if (recovery) tx.set(deliveryRef, receipt); else tx.create(deliveryRef, receipt);
          tx.set(interlockRef(), binding);
          return binding;
        });
        if (!result) { if (permit?.kind === 'unsent') owned = permit; return false; }
        if (permit?.kind === 'success' && (now().toISOString().slice(0, 10) !== permit.day || now().getTime() >= Date.parse(permit.deadline))) throw deny();
        owned = result;
        await assertExecution({ jobId });
        return true;
      } catch { owned = undefined; throw deny(); } finally { busy = false; }
    },
    assertExecution,
    async finishSuccess({ jobId } = {}) {
      const permit = owned;
      await assertExecution({ jobId });
      owned = undefined;
      await db.runTransaction(async tx => {
        const operator = await tx.get(operatorRef()), interlock = (await tx.get(interlockRef())).data();
        const job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data();
        const attempt = (await tx.get(db.doc(`workplaceHostedAttempts/${digest([jobId, 1])}`))).data();
        const budget = (await tx.get(db.doc(`workplaceAnalysisBudgetAttempts/${digest([jobId, 1])}`))).data();
        const worker = (await tx.get(db.doc('workplaceJournalWorker/control'))).data();
        const profile = digest(['model','currency','inputRate','outputRate','reviewedAt','expiresAt'].map(k => PRICE_PROFILE[k]));
        const brake = (await tx.get(db.doc(`workplaceJournalWorker/price-${profile}`))).data();
        if (!allowed(operator.data()) || version(operator) !== permit.operatorVersion || interlock?.state !== 'held'
          || interlock.nonce !== permit.nonce || interlock.generation !== permit.generation || interlock.jobId !== jobId
          || interlock.session !== permit.session || job?.state !== 'processed' || job.attempts !== 1
          || job.leaseOwner !== null || job.leaseUntil !== null || worker?.leaseOwner
          || attempt?.stage !== 'generation' || attempt.session !== permit.session || attempt.day !== permit.day
          || attempt.reservedMicroUsd !== 9560 || budget?.day !== permit.day || budget.reservedMicroUsd !== 9560
          || (brake && brake.blocked !== false) || !job.usage
          || !['inputTokens','outputTokens'].every(k => Number.isSafeInteger(job.usage[k]) && job.usage[k] >= 0)
          || job.usage.inputTokens > 14000 || job.usage.outputTokens > 1024
          || !Number.isFinite(Date.parse(job.updatedAt)) || Date.parse(job.updatedAt) >= Date.parse(permit.deadline)) throw deny();
        if (await source(tx, job) !== permit.fingerprint || now().toISOString().slice(0, 10) !== permit.day
          || now().getTime() >= Date.parse(permit.deadline)) throw deny();
      });
      if (now().toISOString().slice(0, 10) !== permit.day || now().getTime() >= Date.parse(permit.deadline)) throw deny();
      owned = { ...permit, kind: 'success' };
    },
    invalidate() { owned = undefined; },
    async settleWake({ jobId, wakeId } = {}) {
      if (enabled !== true || busy || !owned || owned.kind || owned.jobId !== jobId || owned.wakeId !== wakeId) return false;
      const permit = owned; owned = undefined; busy = true;
      const nonce = randomUUID();
      try {
        const settled = await db.runTransaction(async tx => {
          const operator = await tx.get(operatorRef()), interlock = (await tx.get(interlockRef())).data();
          const job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data();
          const wakeRef = db.doc(`workplaceWakeReceipts/${hashId(wakeId)}`), deliveryRef = db.doc(`workplaceWakeJobs/${hashId(jobId)}`);
          const wake = (await tx.get(wakeRef)).data(), delivery = (await tx.get(deliveryRef)).data();
          if (!allowed(operator.data()) || version(operator) !== permit.operatorVersion || interlock?.state !== 'held'
            || interlock.nonce !== permit.nonce || interlock.generation !== permit.generation || interlock.session !== permit.session
            || interlock.jobId !== jobId || permit.generation >= Number.MAX_SAFE_INTEGER
            || wake?.jobId !== jobId || wake.wakeId !== wakeId || wake.state !== 'claimed'
            || delivery?.jobId !== jobId || delivery.wakeId !== wakeId || delivery.state !== 'claimed'
            || job?.state !== 'queued' || job.attempts !== 0 || job.leaseOwner != null || job.leaseUntil != null
            || (job.dueAt != null && !Number.isFinite(Date.parse(job.dueAt)))) return null;
          for (const collection of ['workplaceAnalysisBudgetAttempts', 'workplaceHostedAttempts']) for (const attempt of [1, 2]) {
            if ((await tx.get(db.doc(`${collection}/${digest([jobId, attempt])}`))).exists) return null;
          }
          if (await source(tx, job) !== permit.fingerprint || now().toISOString().slice(0, 10) !== permit.day
            || now().getTime() >= Date.parse(permit.deadline)) return null;
          const binding = { ...permit, state: 'unsent-wait', nonce, generation: permit.generation + 1, dueAt: job.dueAt ?? null };
          tx.set(interlockRef(), binding);
          tx.update(wakeRef, { state: 'safe-unsent' }); tx.update(deliveryRef, { state: 'safe-unsent' });
          return binding;
        });
        if (!settled) return false;
        if (now().toISOString().slice(0, 10) !== permit.day || now().getTime() >= Date.parse(permit.deadline)) throw deny();
        owned = { ...settled, kind: 'unsent' }; return true;
      } catch { owned = undefined; throw deny(); } finally { busy = false; }
    },
  };
  gates.add(gate); return gate;
}
function createReadinessWorkplaceComposition(options = {}) {
  const { createHostedWakeAdapter } = require('./workplaceHostedWake');
  if (options.enabled !== true || options.readinessGate !== true) return createHostedWakeAdapter();
  const gate = createWorkplaceReadinessGate(options);
  const runtime = require('./workplaceHostedRuntime').createHostedWorkplaceRuntime({ ...options, gate });
  const authority = require('./workplaceWakeAuthority').createWorkplaceWakeAuthority({ ...options, gate });
  return createHostedWakeAdapter({ enabled: true, ...authority, runtime });
}
module.exports = { createWorkplaceReadinessGate, createReadinessWorkplaceComposition, isWorkplaceReadinessGate: value => gates.has(value) };
