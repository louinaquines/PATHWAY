// Real authorized message, isolated in-memory section/student mapping.
// Does not claim a production coordinator login or write Firebase records.
const assert = require('node:assert/strict');
const { findTestMessage } = require('./company-inbox-live-qa');
const { installCompanyInbox, createCompanyInbox } = require('../companyMailInbox');
async function main() {
  const { found, saved } = await findTestMessage();
  const ownerId = 'isolated-loui-test-coordinator';
  const sectionId = 'isolated-company-mail-section';
  const studentId = 'isolated-company-mail-student';
  const mapping = { coordinatorId: ownerId, sectionId, studentId, companyName: 'TEST ONLY Company', providerThreadId: found.id };
  const routes = new Map();
  const snap = data => ({ exists: true, data: () => data });
  const db = { collection(name) {
    if (name === 'users') return { doc: id => ({ get: async () => { assert.equal(id, studentId); return snap({ sectionId, department: 'Isolated QA' }); } }) };
    assert.equal(name, 'sections');
    return { doc: id => { assert.equal(id, sectionId); return { collection: type => {
      assert.equal(type, 'companyConversations');
      return { doc: conversationId => { assert.equal(conversationId, 'test-reply'); return { get: async () => snap(mapping) }; },
        limit: () => ({ get: async () => ({ size: 1, docs: [{ id: 'test-reply', data: () => mapping }] }) }) };
    } }; } };
  } };
  const inbox = createCompanyInbox({ COMPANY_INBOX_ENABLED: '1', COMPANY_INBOX_OWNER_UID: ownerId,
    COMPANY_INBOX_MAILBOX: saved.mailbox, COMPANY_INBOX_CLIENT_ID: saved.client_id,
    COMPANY_INBOX_CLIENT_SECRET: saved.client_secret, COMPANY_INBOX_REFRESH_TOKEN: saved.refresh_token });
  installCompanyInbox({ app: { get: (route, _middleware, handler) => routes.set(route, handler) }, db,
    requireStaff: () => {}, allowRate: () => true, inbox,
    coordinatorSection: async req => { if (req.staff.uid !== ownerId || req.params.sectionId !== sectionId) throw Object.assign(new Error('Assigned sections only.'), { status: 403 }); } });
  const request = { staff: { uid: ownerId, role: 'coordinator', data: { department: 'Isolated QA' } }, params: { sectionId, conversationId: 'test-reply' } };
  const response = () => ({ code: 200, set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const list = response();
  await routes.get('/coordinator/sections/:sectionId/company-conversations')(request, list);
  assert.equal(list.body.connected, true); assert.equal(list.body.conversations.length, 1);
  const detail = response();
  await routes.get('/coordinator/sections/:sectionId/company-conversations/:conversationId')(request, detail);
  assert.equal(detail.code, 200);
  assert.ok(detail.body.messages.some(message => message.subject === 'PATHWAY TEST - company reply' && message.text.includes('This is a test company reply')));
  const denied = response();
  await routes.get('/coordinator/sections/:sectionId/company-conversations/:conversationId')({ ...request, staff: { ...request.staff, uid: 'outsider' } }, denied);
  assert.equal(denied.code, 403);
  console.log(JSON.stringify({ isolatedMapping: true, realTestReplyLoaded: true, listPassed: true, outsiderDenied: true, firebaseWrites: false, mailboxChanged: false, productionAccountLinked: false }));
}
main().catch(() => { console.error('Linked inbox QA failed; no credentials or message contents logged.'); process.exitCode = 1; });
