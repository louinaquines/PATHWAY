const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../PATHWAY-master/services/journalSubmission.js'), 'utf8').replace(/export /g, '');
  return vm.runInNewContext(`${source}\ncreateJournalMigrationClient`, { JSON });
}
test('unchanged failed submission reuses identity, changed payload gets new identity, acknowledged success resets', async () => {
  let fail = true, ids = 0; const sent = [];
  const client = load()(async (route, data) => { sent.push(JSON.parse(JSON.stringify(data))); if (fail) throw Error('network'); return { entryId: 'saved' }; }, () => `request-${++ids}`);
  const payload = { rawNotes: 'Original', hours: 32 };
  await assert.rejects(client.submit(payload)); await assert.rejects(client.submit(payload));
  assert.equal(sent[0].requestId, sent[1].requestId);
  await assert.rejects(client.submit({ ...payload, hours: 33 })); assert.notEqual(sent[2].requestId, sent[1].requestId);
  fail = false; await client.submit({ ...payload, hours: 33 }); assert.equal(sent[3].requestId, sent[2].requestId);
  await client.submit(payload); assert.notEqual(sent[4].requestId, sent[3].requestId);
});
test('submission and revision errors propagate without fallback or changed source payload', async () => {
  const payload = { rawNotes: 'Keep original', refined: 'Polished', aiRefined: true, hours: 24, entryId: 'legacy', expectedRevision: 0 };
  let calls = 0;
  const client = load()(async (route, data) => { calls++; assert.equal(route, '/student/journals'); assert.equal(data.rawNotes, payload.rawNotes); assert.equal(data.expectedRevision, 0); throw Object.assign(Error('Conflict'), { status: 409 }); }, () => 'request');
  await assert.rejects(client.submit(payload), e => e.status === 409); assert.equal(calls, 1); assert.equal(payload.requestId, undefined);
});
test('consent retry preserves choice identity; read never grants or writes consent', async () => {
  const sent = []; let ids = 0;
  const client = load()(async (route, body) => { sent.push({ route, body }); if (route.endsWith('/read')) return { granted: false, revision: 0 }; throw Error('network'); }, () => `request-${++ids}`);
  await client.readConsent(); assert.equal(sent[0].route, '/student/journal-analysis-consent/read');
  const choice = { granted: true, expectedRevision: 0, disclosureVersion: 'workplace-journal-consent-v2' };
  await assert.rejects(client.saveConsent(choice)); await assert.rejects(client.saveConsent(choice));
  assert.equal(sent[1].body.requestId, sent[2].body.requestId);
});
