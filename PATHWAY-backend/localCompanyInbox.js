const fs = require('node:fs');
const path = require('node:path');
const { READ_SCOPE } = require('./companyMailInbox');
function loadLocalCompanyInbox(env = process.env, read = file => fs.readFileSync(file, 'utf8')) {
  if (env.PATHWAY_LOCAL_COMPANY_INBOX !== '1') return env;
  if (env.NODE_ENV === 'production' || !/^[A-Za-z0-9_-]{1,128}$/.test(env.COMPANY_INBOX_OWNER_UID || '')) {
    throw new Error('Local inbox requires a non-production backend and an explicit coordinator UID.');
  }
  const data = JSON.parse(read(path.join(__dirname, '.env.company-inbox-oauth.json')));
  if (data.scope !== READ_SCOPE || data.mailbox !== 'pathwaysystem4@gmail.com'
    || !data.client_id?.endsWith('.apps.googleusercontent.com') || !data.client_secret || !data.refresh_token) {
    throw new Error('Local inbox authorization is invalid.');
  }
  return { ...env, COMPANY_INBOX_ENABLED: '1', COMPANY_INBOX_MAILBOX: data.mailbox,
    COMPANY_INBOX_CLIENT_ID: data.client_id, COMPANY_INBOX_CLIENT_SECRET: data.client_secret,
    COMPANY_INBOX_REFRESH_TOKEN: data.refresh_token };
}
module.exports = { loadLocalCompanyInbox };
