const { localDispatchAllowed, createWorkplaceLocalDispatch } = require('../workplaceLocalDispatch');
function createLocalRuntime({ db, env = process.env, clock, ...timers }) {
  let runBatch;
  if (localDispatchAllowed(db, env)) {
    const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
    const { createLocalAnalyzer } = require('./workplace-local-analyzer');
    runBatch = createWorkplaceJournalWorker({ db, enabled: true, analyzer: createLocalAnalyzer(), clock }).runBatch;
  }
  return createWorkplaceLocalDispatch({ db, env, runBatch, ...timers });
}
module.exports = { createLocalRuntime };
