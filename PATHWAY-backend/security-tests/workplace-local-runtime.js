const { localDispatchAllowed, createWorkplaceLocalDispatch } = require('../workplaceLocalDispatch');
function createLocalRuntime({ db, env = process.env, clock, analyzer, ...timers }) {
  let runBatch, runRecovery;
  if (localDispatchAllowed(db, env)) {
    const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
    const { createLocalAnalyzer } = require('./workplace-local-analyzer');
    const { runConcernRetentionBatch } = require('../workplaceConcernCleanup');
    runBatch = createWorkplaceJournalWorker({ db, enabled: true, analyzer: analyzer || createLocalAnalyzer(), clock }).runBatch;
    runRecovery = () => runConcernRetentionBatch({ db, enabled: true, clock, env });
  }
  return createWorkplaceLocalDispatch({ db, env, runBatch, runRecovery, ...timers });
}
module.exports = { createLocalRuntime };
