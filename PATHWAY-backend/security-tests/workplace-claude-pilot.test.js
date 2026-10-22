const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { openPilotLedger, runPilot } = require('./workplace-claude-pilot');
const { fixtures } = require('./workplace-claude-fixtures');
const now = () => new Date('2026-10-22T12:00:00Z');
function temporary(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pathway-pilot-test-'));
  return Promise.resolve().then(() => fn(path.join(dir,'reservations.jsonl'))).finally(() => fs.rmSync(dir,{ recursive: true,force: true }));
}
test('literal reservation ceiling persists after restart and an uncertain receipt cannot replay', () => temporary(file => {
  let ledger = openPilotLedger(file); assert.equal(ledger.reserve('attempt-one',9560,now()).status,'reserved'); ledger.close();
  ledger = openPilotLedger(file); assert.equal(ledger.reserve('attempt-one',9560,now()).status,'already-reserved');
  for (let i = 2; i <= 10; i++) assert.equal(ledger.reserve(`attempt-${i}`,9560,now()).status,'reserved');
  assert.equal(ledger.reserve('attempt-eleven',1,now()).status,'daily-limit');
  assert.equal(ledger.snapshot(now()).reservedMicroUsd,95600); ledger.close();
}));
test('exclusive lock and missing or corrupt prior ledger fail closed', () => temporary(file => {
  const ledger = openPilotLedger(file); assert.throws(() => openPilotLedger(file)); ledger.reserve('uncertain',9560,now()); ledger.close();
  const original = fs.readFileSync(file,'utf8'); fs.unlinkSync(file); assert.throws(() => openPilotLedger(file));
  fs.unlinkSync(`${file}.lock`); fs.writeFileSync(file,original + 'corrupt\n'); assert.throws(() => openPilotLedger(file));
}));
test('clock rollback and malformed receipts cannot reset the budget; midnight preserves old identities', () => temporary(file => {
  let ledger = openPilotLedger(file); ledger.reserve('old',100000,now());
  assert.throws(() => ledger.reserve('rollback',1,new Date('2026-10-21T12:00:00Z')));
  assert.equal(ledger.reserve('old',1,new Date('2026-10-23T00:00:00Z')).status,'already-reserved');
  assert.equal(ledger.reserve('new',9560,new Date('2026-10-23T00:00:00Z')).status,'reserved'); ledger.close();
  fs.appendFileSync(file,JSON.stringify({ type: 'reserve',attemptId: 'new',at: '2026-10-23T00:00:00.000Z',day: '2026-10-23',microUsd: 9560 })+'\n');
  assert.throws(() => openPilotLedger(file));
}));
test('no paid opt-in touches neither DB nor HTTP nor ledger', async () => {
  assert.deepEqual(await runPilot({}),{ status: 'disabled',results: [],requests: 0 });
});
test('all fixed notes fit the pilot source cap and literal expected classes', () => {
  assert.equal(fixtures.length,9); assert.equal(new Set(fixtures.map(f => f.id)).size,9);
  assert.equal(fixtures.filter(f => f.expected === 'high').length,3); assert.equal(fixtures.filter(f => f.expected === 'none').length,3);
  for (const f of fixtures) { assert.ok(f.notes.length < 500); if (f.evidence) assert.ok(f.notes.includes(f.evidence)); }
});
test('complete-line truncation and durable pilot stop cannot restore allowance', () => temporary(file => {
  let ledger = openPilotLedger(file); ledger.reserve('first',9560,now()); ledger.stop(); ledger.close();
  ledger = openPilotLedger(file); assert.equal(ledger.isStopped(),true); ledger.close();
  const header = fs.readFileSync(file,'utf8').split('\n')[0]+'\n'; fs.writeFileSync(file,header);
  assert.throws(() => openPilotLedger(file));
}));
