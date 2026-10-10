// Explicitly authorized one-field test change; never changes Firebase Authentication.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { getProjectDefaultAccount } = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
const endpoint = `/v1/projects/pathway-57400/databases/(default)/documents/users/${uid}`;
const stateFile = path.resolve(__dirname, '../../tmp/announcement-profile-qa-state.json');
function fingerprint(fields) {
  const copy = { ...fields }; delete copy.email;
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(copy))).digest('hex');
}
async function main() {
  const account = getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('CLI_NOT_AUTHORIZED');
  await requireAuth({ ...account, project: 'pathway-57400', nonInteractive: true });
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com' });
  const before = (await client.get(endpoint)).body;
  const fields = before.fields;
  if (fields.role?.stringValue !== 'student' || fields.sectionId?.stringValue !== 'ynpHVsU7Zbs2Mx9qLIvl') throw new Error('PROFILE_MISMATCH');
  const mode = process.argv[2];
  if (mode === 'check') { console.log(JSON.stringify({ email: fields.email?.stringValue, correctTestStudent: true })); return; }
  let target;
  if (mode === 'set') {
    if (fields.email?.stringValue !== 'dex@gmail.com') throw new Error('ORIGINAL_EMAIL_MISMATCH');
    if (fs.existsSync(stateFile)) throw new Error('QA_STATE_EXISTS_REVIEW_BEFORE_RETRY');
    fs.writeFileSync(stateFile, JSON.stringify({ originalEmail: 'dex@gmail.com', fingerprint: fingerprint(fields) }), { mode: 0o600 });
    target = 'louinaquines@gmail.com';
  } else if (mode === 'restore') {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (!['dex@gmail.com', 'louinaquines@gmail.com'].includes(fields.email?.stringValue)) throw new Error('EMAIL_CHANGED_EXTERNALLY');
    target = state.originalEmail;
  } else throw new Error('USE_CHECK_SET_OR_RESTORE');
  await client.patch(`${endpoint}?updateMask.fieldPaths=email&currentDocument.updateTime=${encodeURIComponent(before.updateTime)}`, { fields: { email: { stringValue: target } } });
  const after = (await client.get(endpoint)).body;
  if (after.fields.email?.stringValue !== target) throw new Error('READBACK_FAILED');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  console.log(JSON.stringify({ email: target, unrelatedFieldsUnchanged: fingerprint(after.fields) === fingerprint(fields), authenticationUntouched: true }));
}
main().catch(() => { console.error('Profile QA failed safely; review current email before continuing.'); process.exitCode = 1; });
