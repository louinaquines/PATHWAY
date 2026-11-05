const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { migrationFixture } = require('./journal-migration-fixture');
const { notifyStudentUpdate } = require('../studentUpdateNotifications');
let f;
before(async () => { f = await migrationFixture(() => {}); });
after(async () => { if (f) await f.close(); });
test('section updates reach only students in the affected department and section, atomically', async () => {
  const department = 'Notification Test', sectionId = 'notification-section';
  for (const [id, data] of Object.entries({
    'notice-owner': { role: 'student', department, sectionId },
    'notice-other-section': { role: 'student', department, sectionId: 'another-section' },
    'notice-other-department': { role: 'student', department: 'Other', sectionId },
    'notice-staff': { role: 'coordinator', department, sectionId },
  })) await f.db.doc(`users/${id}`).set(data);
  const update = { department, sectionId, senderId: 'notice-staff', title: 'Deadline updated', message: 'Check your requirements.', type: 'requirement_deadline' };
  const notices = () => f.db.collection('notifications').where('type', '==', update.type).get();
  const before = (await notices()).size;
  await assert.rejects(f.db.runTransaction(async tx => {
    await notifyStudentUpdate(tx, f.db, update);
    throw new Error('Rollback');
  }), /Rollback/);
  assert.equal((await notices()).size, before);
  await f.db.runTransaction(tx => notifyStudentUpdate(tx, f.db, update));
  const added = (await notices()).docs.filter(doc => doc.data().recipientId === 'notice-owner');
  assert.equal((await notices()).size, before + 1);
  assert.equal(added.length, 1);
  assert.equal(added[0].data().read, false);
  assert.ok(added[0].data().createdAt);
});
