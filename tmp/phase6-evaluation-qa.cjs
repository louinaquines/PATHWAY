const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { getProjectDefaultAccount } = require('../PATHWAY-backend/node_modules/firebase-tools/lib/auth');
const { requireAuth } = require('../PATHWAY-backend/node_modules/firebase-tools/lib/requireAuth');
const { Client } = require('../PATHWAY-backend/node_modules/firebase-tools/lib/apiv2');
const statePath = path.join(__dirname, 'phase6-evaluation-state.json');
const base = '/v1/projects/pathway-57400/databases/(default)/documents';
const studentId = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
async function main() {
  const account = getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('CLI authorization required');
  await requireAuth({ ...account, project: 'pathway-57400', nonInteractive: true });
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com' });
  const profile = (await client.get(`${base}/users/${studentId}`)).body;
  if (profile.fields.role?.stringValue !== 'student' || profile.fields.email?.stringValue !== 'dex@gmail.com' || profile.fields.sectionId?.stringValue !== 'ynpHVsU7Zbs2Mx9qLIvl') throw new Error('Test profile mismatch');
  if (process.argv[2] === 'create') {
    if (fs.existsSync(statePath)) throw new Error('Existing test fixture: do not create another');
    const token = crypto.randomBytes(32).toString('hex');
    const id = `TEST-ONLY-PHASE6-${crypto.randomBytes(8).toString('hex')}`;
    const values = { studentId, studentName: 'Dexter — TEST ONLY', sectionId: 'ynpHVsU7Zbs2Mx9qLIvl', department: profile.fields.department?.stringValue || '', supervisorName: 'Fictional supervisor — TEST ONLY', supervisorEmail: 'louinaquines@gmail.com', companyName: 'TEST ONLY — OTP acceptance fixture', tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000).toISOString(), createdBy: '6hNIQRfTVzXDPPHetPTEqZFelCm2', createdAt: new Date().toISOString() };
    const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { stringValue: value }]));
    fields.used = { booleanValue: false }; fields.testOnly = { booleanValue: true };
    const state = { id, token, originalProfileFields: profile.fields };
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
    await client.post(`${base}/evaluations?documentId=${id}`, { fields });
    console.log(JSON.stringify({ testEvaluationCreated: true, id, profileUnchanged: true }));
  } else if (process.argv[2] === 'check') {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const evaluation = (await client.get(`${base}/evaluations/${state.id}`)).body.fields;
    const canonical = value => value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key, canonical(item)])) : value;
    console.log(JSON.stringify({ used: evaluation.used?.booleanValue, submitted: Boolean(evaluation.submittedAt), codeRequested: Boolean(evaluation.otpRequestedAt), supervisorVerified: Boolean(evaluation.verifiedSessionHash?.stringValue), profileUnchanged: JSON.stringify(canonical(profile.fields)) === JSON.stringify(canonical(state.originalProfileFields)) }));
  } else if (process.argv[2] === 'replay') {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const before = (await client.get(`${base}/evaluations/${state.id}`)).body;
    if (!before.fields.used?.booleanValue) throw new Error('Replay test requires an already submitted fixture');
    const response = await fetch(`https://pathway-backend-49a9.onrender.com/evaluation/${state.token}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings: { technicalSkills: 3, workQuality: 3, professionalism: 3, communication: 3, attendance: 3 }, comments: 'TEST ONLY — replay must be rejected.' }),
    });
    const after = (await client.get(`${base}/evaluations/${state.id}`)).body;
    if (response.status !== 410 || before.updateTime !== after.updateTime) throw new Error('Replay acceptance failed');
    console.log(JSON.stringify({ replayDenied: true, status: response.status, evaluationUnchanged: true }));
  } else throw new Error('Use create, check or replay');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
