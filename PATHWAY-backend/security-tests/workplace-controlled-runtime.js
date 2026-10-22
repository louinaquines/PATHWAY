const fs = require('node:fs'), path = require('node:path');
const { controlledDispatchAllowed, createControlledDispatch } = require('./workplace-controlled-dispatch');
const { fixtures } = require('./workplace-claude-fixtures');
function createControlledRuntime({ db, env = process.env, clock = () => new Date() }) {
  const inert = { mode: 'controlled-unavailable', start: async () => ({ status: 'unavailable' }),
    wake: async () => ({ status: 'unavailable' }), stop() {} };
  const window = { studentId: env.PATHWAY_CONTROLLED_STUDENT_ID, requestId: env.PATHWAY_CONTROLLED_REQUEST_ID,
    source: fixtures.find(f => f.id === env.PATHWAY_CONTROLLED_FIXTURE_ID)?.notes,
    startAt: env.PATHWAY_CONTROLLED_START_AT, endAt: env.PATHWAY_CONTROLLED_END_AT };
  if (!controlledDispatchAllowed({ db, env, window, now: clock() })) return inert;
  // The executable factory cannot choose/create a fresh ledger to bypass prior paid receipts or stop.
  const file = path.resolve(__dirname, '../../output/release/workplace-claude-pilot-reservations.jsonl');
  if (fs.existsSync(`${file}.stopped`) || [file, `${file}.started`, `${file}.continuity`].some(p => !fs.existsSync(p) || !fs.lstatSync(p).isFile() || fs.lstatSync(p).isSymbolicLink())) return inert;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (typeof apiKey !== 'string' || !apiKey.trim()) return inert;
  let ledger;
  try { ledger = require('./workplace-claude-pilot').openPilotLedger(file); } catch { return inert; }
  const { runConcernRetentionBatch } = require('../workplaceConcernCleanup');
  const dispatch = createControlledDispatch({ db, env, window, clock, apiKey, ledger,
    runRecovery: () => runConcernRetentionBatch({ db, enabled: true, env, clock }) });
  return ownControlledRuntime(dispatch, ledger);
}
function ownControlledRuntime(dispatch, ledger) {
  let active, stopped = false, closed = false;
  function close() { if (!closed) { closed = true; try { ledger.close(); } catch {} } }
  function stop() { stopped = true; dispatch.stop(); if (active) void active.finally(close); else close(); }
  function run(method) {
    if (stopped) return Promise.resolve({ status: 'unavailable' });
    if (active) { if (method === 'wake') void dispatch.wake(); return active; }
    active = Promise.resolve().then(() => dispatch[method]()).then(result => {
      if (result.status === 'unavailable') stop(); return result;
    }).finally(() => { active = undefined; if (stopped) close(); });
    return active;
  }
  return { mode: 'controlled-claude', start: () => run('start'), wake: () => run('wake'), stop };
}
module.exports = { createControlledRuntime, ownControlledRuntime };
