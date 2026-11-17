// Internal control dependency only: no route, credentials, environment or provider transport.
const { randomUUID } = require('node:crypto');
function createHostedWorkplaceControl({ enabled = false, db, clock = () => new Date() } = {}) {
  return { async stop() {
    if (enabled !== true) return { status: 'disabled' };
    if (typeof db?.runTransaction !== 'function') throw Error('Workplace control unavailable.');
    return db.runTransaction(async tx => {
      const ref = db.doc('workplaceHostedControl/control'), data = (await tx.get(ref)).data(), now = clock();
      if (data?.stopProtocol !== 'operator-revision-v1' || !Number.isSafeInteger(data.operatorRevision)
        || data.operatorRevision < 0 || data.operatorRevision >= Number.MAX_SAFE_INTEGER
        || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Workplace control unavailable.');
      const revision = data.operatorRevision + 1;
      tx.update(ref, { stopped: true, stopSession: randomUUID(), operatorRevision: revision, stoppedAt: now.toISOString() });
      return { status: 'stopped', revision };
    });
  } };
}
module.exports = { createHostedWorkplaceControl };
