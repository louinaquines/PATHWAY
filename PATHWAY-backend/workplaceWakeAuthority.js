// Uninstalled dependencies for a workplace-only wake adapter; never loads secrets or starts processing.
const { timingSafeEqual, createHash } = require('node:crypto');
const { validId, digest, DISCLOSURE_VERSION } = require('./workplaceJournalConsent');
function createWorkplaceWakeAuthority({ enabled = false, recoverUnsent = false, readinessGate = false, gate, db, workplaceSecret, clock = () => new Date() } = {}) {
  if (enabled !== true) return { authorize: async () => false, claimWake: async () => false, settleWake: async () => false };
  if (typeof db?.runTransaction !== 'function' || typeof workplaceSecret !== 'string' || !/^[a-f0-9]{64}$/.test(workplaceSecret)) throw Error('Explicit workplace wake authority required.');
  if (readinessGate === true && !require('./workplaceReadinessGate').isWorkplaceReadinessGate(gate)) throw Error('Explicit readiness gate required.');
  const expected = Buffer.from(workplaceSecret, 'ascii');
  const key = value => createHash('sha256').update(value).digest('hex');
  const acknowledged = new Map();
  const matches = (a, b) => a?.jobId === b?.jobId && a?.wakeId === b?.wakeId
    && a?.fingerprint === b?.fingerprint && a?.controlVersion === b?.controlVersion && a?.deliveryProtocol === 'safe-unsent-v1';
  async function unsent(tx, jobId, ignoreDue = false) {
    const control = await tx.get(db.doc('workplaceHostedControl/control'));
    const c = control.data(), job = (await tx.get(db.doc(`workplaceJournalAnalysisJobs/${jobId}`))).data(), now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || c?.enabled !== true || c.stopped !== false
      || c.operatingMode !== 'successful-next-job-v1' || c.stopProtocol !== 'operator-revision-v1'
      || !Number.isSafeInteger(c.operatorRevision) || c.operatorRevision < 0 || !validId(c.epoch)
      || !Number.isFinite(Date.parse(c.notBefore)) || Date.parse(c.notBefore) > now.getTime()
      || job?.state !== 'queued' || job.attempts !== 0 || job.leaseOwner != null || job.leaseUntil != null
      || !validId(job.studentId) || !validId(job.entryId) || !Number.isSafeInteger(job.sourceRevision) || job.sourceRevision < 1
      || !Number.isSafeInteger(job.consentRevision) || job.consentRevision < 1 || job.disclosureVersion !== DISCLOSURE_VERSION
      || !/^[a-f0-9]{64}$/.test(job.sourceHash || '') || !Number.isFinite(Date.parse(job.createdAt))
      || Date.parse(job.createdAt) < Date.parse(c.notBefore) || Date.parse(job.createdAt) > now.getTime()
      || (job.dueAt != null && (!Number.isFinite(Date.parse(job.dueAt)) || (!ignoreDue && Date.parse(job.dueAt) > now.getTime())))) return null;
    for (const collection of ['workplaceAnalysisBudgetAttempts', 'workplaceHostedAttempts']) for (const attempt of [1, 2]) {
      if ((await tx.get(db.doc(`${collection}/${digest([jobId, attempt])}`))).exists) return null;
    }
    return { fingerprint: digest([job.studentId, job.entryId, job.sourceRevision, job.sourceHash,
      job.consentRevision, job.disclosureVersion, job.createdAt]),
      controlVersion: `${control.updateTime.seconds}:${control.updateTime.nanoseconds}`, deliveryProtocol: 'safe-unsent-v1' };
  }
  return {
    authorize: async authorization => {
      if (typeof authorization !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(authorization)) return false;
      return timingSafeEqual(expected, Buffer.from(authorization.slice(7), 'ascii'));
    },
    claimWake: async identity => {
      if (readinessGate === true) return gate.claimWake(identity);
      const jobId = identity?.jobId, wakeId = identity?.wakeId;
      if (!validId(jobId) || !validId(wakeId)) return false;
      const permit = acknowledged.get(jobId);
      if (recoverUnsent === true && permit?.state === 'safe-unsent') acknowledged.delete(jobId);
      const now = clock(); if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Wake clock unavailable.');
      const wake = db.collection('workplaceWakeReceipts').doc(key(wakeId));
      const job = db.collection('workplaceWakeJobs').doc(key(jobId));
      const claimed = await db.runTransaction(async tx => {
        const control = await tx.get(db.collection('workplaceHostedControl').doc('control'));
        if (control.data()?.readinessProtocol != null) return null;
        const [existingWake, existingJob] = await Promise.all([tx.get(wake), tx.get(job)]);
        if (existingWake.exists) return null;
        let proof;
        if (recoverUnsent === true) {
          proof = await unsent(tx, jobId);
          if (!proof) return null;
        }
        if (existingJob.exists && (recoverUnsent !== true || permit?.state !== 'safe-unsent'
          || existingJob.data().state !== 'safe-unsent' || !matches(existingJob.data(), permit)
          || proof.fingerprint !== permit.fingerprint || proof.controlVersion !== permit.controlVersion)) return null;
        const data = { jobId, wakeId, claimedAt: now.toISOString(), state: 'claimed', ...proof };
        tx.create(wake, data);
        if (existingJob.exists) tx.set(job, data); else tx.create(job, data);
        return data;
      });
      if (!claimed) {
        if (recoverUnsent === true && permit?.state === 'safe-unsent' && !acknowledged.has(jobId)) acknowledged.set(jobId, permit);
        return false;
      }
      if (recoverUnsent === true) acknowledged.set(jobId, claimed);
      return true;
    },
    settleWake: async identity => {
      if (readinessGate === true) return gate.settleWake(identity);
      if (recoverUnsent !== true) return false;
      const jobId = identity?.jobId, wakeId = identity?.wakeId, permit = acknowledged.get(jobId);
      if (!validId(jobId) || !validId(wakeId) || permit?.state !== 'claimed' || permit.wakeId !== wakeId) return false;
      // Consume before awaiting: lost settlement acknowledgement can never recreate a recovery permit.
      acknowledged.delete(jobId);
      const settled = await db.runTransaction(async tx => {
        const wake = db.collection('workplaceWakeReceipts').doc(key(wakeId)), job = db.collection('workplaceWakeJobs').doc(key(jobId));
        const receipt = (await tx.get(wake)).data(), current = (await tx.get(job)).data();
        if (receipt?.state !== 'claimed' || current?.state !== 'claimed' || !matches(receipt, permit) || !matches(current, permit)) return false;
        const proof = await unsent(tx, jobId, true), now = clock();
        if (!proof || proof.fingerprint !== permit.fingerprint || proof.controlVersion !== permit.controlVersion
          || !(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
        const outcome = { state: 'safe-unsent', settledAt: now.toISOString() };
        tx.update(wake, outcome); tx.update(job, outcome); return true;
      });
      if (settled) acknowledged.set(jobId, { ...permit, state: 'safe-unsent' });
      return settled;
    },
  };
}
module.exports = { createWorkplaceWakeAuthority };
