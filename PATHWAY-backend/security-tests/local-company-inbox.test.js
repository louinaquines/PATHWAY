const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadLocalCompanyInbox } = require('../localCompanyInbox');
const { READ_SCOPE } = require('../companyMailInbox');
const data = { scope: READ_SCOPE, mailbox: 'pathwaysystem4@gmail.com', client_id: 'test.apps.googleusercontent.com', client_secret: 'synthetic', refresh_token: 'synthetic' };
test('no implicit credential loading', () => {
  const env = {};
  assert.equal(loadLocalCompanyInbox(env, () => { throw new Error('Should not read'); }), env);
});
test('local authorization cannot enable production or an unspecified owner', () => {
  for (const env of [{ NODE_ENV: 'production', COMPANY_INBOX_OWNER_UID: 'staff' }, {}]) {
    assert.throws(() => loadLocalCompanyInbox({ ...env, PATHWAY_LOCAL_COMPANY_INBOX: '1' }, () => JSON.stringify(data)));
  }
});
test('loads only the selected mailbox and read-only scope into a new configuration', () => {
  const env = { PATHWAY_LOCAL_COMPANY_INBOX: '1', COMPANY_INBOX_OWNER_UID: 'staff' };
  const result = loadLocalCompanyInbox(env, () => JSON.stringify(data));
  assert.equal(result.COMPANY_INBOX_MAILBOX, data.mailbox);
  assert.equal(result.COMPANY_INBOX_ENABLED, '1');
  assert.equal(env.COMPANY_INBOX_REFRESH_TOKEN, undefined);
  assert.throws(() => loadLocalCompanyInbox(env, () => JSON.stringify({ ...data, mailbox: 'other@example.com' })));
});
