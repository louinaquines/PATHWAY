// Server-only reservation boundary. No provider calls, refunds or automatic enablement.
async function reserveWorkplaceAttempt({ db, enabled, attemptId, now, reservedMicroUsd } = {}) {
  if (enabled !== true) return { status: 'disabled' };
  if (typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(attemptId)
    || !(now instanceof Date) || !Number.isFinite(now.getTime())
    || !Number.isSafeInteger(reservedMicroUsd) || reservedMicroUsd <= 0 || reservedMicroUsd > 100000) {
    throw new Error('Invalid workplace budget reservation.');
  }
  const day = now.toISOString().slice(0, 10);
  const receipt = db.collection('workplaceAnalysisBudgetAttempts').doc(attemptId);
  const daily = db.collection('workplaceAnalysisBudgetDays').doc(day);
  return db.runTransaction(async tx => {
    const prior = await tx.get(receipt);
    if (prior.exists) return { status: 'already-reserved' };
    const snapshot = await tx.get(daily);
    const totals = snapshot.exists ? snapshot.data() : { attempts: 0, reservedMicroUsd: 0 };
    if (!Number.isSafeInteger(totals.attempts) || totals.attempts < 0
      || !Number.isSafeInteger(totals.reservedMicroUsd) || totals.reservedMicroUsd < 0) {
      throw new Error('Workplace budget counters unavailable.');
    }
    if (totals.attempts >= 10 || totals.reservedMicroUsd > 100000 - reservedMicroUsd) {
      return { status: 'daily-limit' };
    }
    tx.set(daily, { attempts: totals.attempts + 1, reservedMicroUsd: totals.reservedMicroUsd + reservedMicroUsd });
    tx.set(receipt, { day, reservedMicroUsd });
    return { status: 'reserved' };
  });
}
module.exports = { reserveWorkplaceAttempt };
