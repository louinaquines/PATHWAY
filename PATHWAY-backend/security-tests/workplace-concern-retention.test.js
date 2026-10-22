const { test } = require('node:test');
const assert = require('node:assert/strict');
const { retentionDates, retentionStage, minimalConcernAudit } = require('../workplaceConcernRetention');
test('evidence uses ninety elapsed days and audit uses twelve UTC calendar months', () => {
  assert.deepEqual(retentionDates('2026-10-22T12:00:00Z'), { evidenceDeleteAt: '2027-01-20T12:00:00.000Z', auditDeleteAt: '2027-10-22T12:00:00.000Z' });
  assert.equal(retentionDates('2028-02-29T05:06:07.123Z').auditDeleteAt, '2029-02-28T05:06:07.123Z');
  assert.equal(retentionDates('2027-12-31T23:59:59Z').auditDeleteAt, '2028-12-31T23:59:59.000Z');
  for (const bad of [null, '', '2026-02-30T12:00:00Z', 'tomorrow', '2026-10-22']) assert.throws(() => retentionDates(bad));
});
test('exact boundaries, early saved expiry, legacy dates and invalid metadata fail closed', () => {
  const item = { state: 'resolved', closedAt: '2026-10-22T12:00:00Z' };
  assert.equal(retentionStage(item, new Date('2027-01-20T11:59:59.999Z')), 'evidence');
  assert.equal(retentionStage(item, new Date('2027-01-20T12:00:00Z')), 'audit');
  assert.equal(retentionStage(item, new Date('2027-10-22T12:00:00Z')), 'expired');
  assert.equal(retentionStage({ ...item, auditDeleteAt: '2027-01-01T00:00:00Z' }, new Date('2027-01-01T00:00:00Z')), 'expired');
  assert.equal(retentionStage({ ...item, evidencePurged: true }, new Date('2026-11-01T00:00:00Z')), 'audit');
  assert.equal(retentionStage({ ...item, auditDeleteAt: '2030-01-01T00:00:00Z' }, new Date('2027-10-22T12:00:00Z')), 'expired');
  for (const patch of [{ closedAt: null }, { closedAt: 'invalid' }, { auditDeleteAt: 'invalid' }, { evidenceDeleteAt: 'invalid' }]) assert.equal(retentionStage({ ...item, ...patch }, new Date('2027-01-01')), 'invalid');
  assert.equal(retentionStage(item, new Date('2026-10-21')), 'invalid');
  assert.equal(retentionStage({ state: 'open' }, new Date('2040-01-01')), 'open');
});
test('minimal audit removes free text, source hashes and routing while preserving typed actions', () => {
  const safe = minimalConcernAudit({ state: 'resolved', studentId: 'student', closedAt: '2026-10-22T12:00:00Z',
    sourceHash: 'SECRET', recipientId: 'old-coord', findings: [{ quote: 'SECRET' }], unexpected: 'SECRET',
    history: [{ action: 'contact', actorId: 'coord', at: '2026-10-22T11:00:00Z', outcome: 'failed', note: 'SECRET' },
      { action: 'SECRET', actorId: 'coord', at: '2026-10-22T11:00:00Z' }] });
  assert.equal(JSON.stringify(safe).includes('SECRET'), false); assert.equal(safe.recipientId, undefined);
  assert.deepEqual(safe.history, [{ action: 'contact', actorId: 'coord', at: '2026-10-22T11:00:00Z', outcome: 'failed' }]);
});
