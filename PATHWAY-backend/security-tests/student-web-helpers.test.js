const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadHelper(name, globals, exportName) {
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/services', `${name}.js`), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const exported = exportName || (name === 'cloudinaryUpload' ? 'uploadCloudinaryFile' : 'studentAlert');
  return vm.runInNewContext(`${source}\n${exported}`, globals);
}
const authorization = { apiKey: 'test', timestamp: 123, signature: 'signed', publicId: 'test/doc', uploadUrl: 'https://upload.invalid', intentId: 'intent' };
const response = () => ({ ok: true, json: async () => ({ secure_url: 'https://asset.invalid/doc', public_id: 'test/doc', signature: 'result', version: 1 }) });

test('attendance history count matches displayed previous shifts and selected dates', () => {
  const helper = loadHelper('attendanceHistory', {}, '({ attendanceHistoryForDate, attendanceRecordCountLabel })');
  const today = '2026-10-08';
  const records = [{ id: 'today', date: today }, { id: 'previous', date: '2026-10-07' }];
  assert.equal(helper.attendanceHistoryForDate([records[0]], today, today).length, 0);
  assert.equal(helper.attendanceHistoryForDate(records, today, today)[0].id, 'previous');
  assert.equal(helper.attendanceHistoryForDate(records, '2026-10-07', today).length, 1);
  assert.equal(helper.attendanceHistoryForDate(records, '2026-10-06', today).length, 0);
  assert.equal(helper.attendanceRecordCountLabel(0), '0 records');
  assert.equal(helper.attendanceRecordCountLabel(1), '1 record');
  assert.equal(helper.attendanceRecordCountLabel(2), '2 records');
});

test('native feedback always includes an OK action when none are provided', () => {
  let buttons;
  const alert = loadHelper('studentAlert', { Platform: { OS: 'android' }, Alert: { alert: (title, message, actions) => { buttons = actions; } } });
  alert.alert('Upload Error', 'Try again');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].text, 'OK');
});

test('styled feedback preserves confirmation actions and supplies a default dismiss action', () => {
  const helper = loadHelper('studentAlert', {}, '({ studentAlert, registerStudentDialog })');
  let dialog;
  const unsubscribe = helper.registerStudentDialog(value => { dialog = value; });
  helper.studentAlert.alert('Error', 'Try again', []);
  assert.equal(dialog.buttons[0].text, 'OK');
  let removed = false;
  helper.studentAlert.alert('Remove?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { removed = true; } }]);
  assert.equal(removed, false);
  dialog.buttons[1].onPress();
  assert.equal(removed, true);
  unsubscribe();
});

test('calendar dates round-trip locally without UTC shifting or invalid dates', () => {
  const parse = loadHelper('calendarDate', {}, 'parseCalendarDate');
  const format = loadHelper('calendarDate', {}, 'calendarDateValue');
  for (const value of ['2026-10-08', '2028-02-29', '2026-01-01', '2026-12-31']) {
    assert.equal(format(parse(value)), value);
  }
  for (const value of ['', '2026-02-30', '2026-13-01', 'not-a-date']) assert.equal(parse(value), null);
});

test('first-login password gate takes precedence over student dashboard approval', () => {
  const destination = loadHelper('authDestination', {}, 'destinationForProfile');
  for (const accountApproved of [false, true]) {
    assert.equal(destination({ role: 'student', passwordChangeRequired: true, accountApproved, requirementsStatus: 'approved', preDeploymentStatus: 'approved' }), 'ChangePassword');
  }
  assert.equal(destination({ role: 'student', passwordChangeRequired: false, accountApproved: true, requirementsStatus: 'not_submitted' }), 'Requirements');
  assert.equal(destination({ role: 'student', passwordChangeRequired: false, accountApproved: true, requirementsStatus: 'approved' }), 'StudentDashboard');
  assert.equal(destination({ role: 'student', accountApproved: false }), 'StudentDashboard');
  assert.equal(destination(null), null);
});

test('web document upload sends actual selected file bytes, name, and signed fields', async () => {
  let body;
  const upload = loadHelper('cloudinaryUpload', { Platform: { OS: 'web' }, FormData,
    fetch: async (url, options) => { assert.equal(url, authorization.uploadUrl); body = options.body; return response(); } });
  const result = await upload({ file: new Blob(['PDF fixture'], { type: 'application/pdf' }), name: 'qa.pdf' }, authorization);
  assert.equal(await body.get('file').text(), 'PDF fixture');
  assert.equal(body.get('file').name, 'qa.pdf');
  assert.equal(body.get('signature'), 'signed');
  assert.equal(body.get('overwrite'), 'false');
  assert.equal(result.intentId, 'intent');
});
test('web profile/document assets without a File upload bytes from the selected URI', async () => {
  let body;
  const upload = loadHelper('cloudinaryUpload', { Platform: { OS: 'web' }, FormData,
    fetch: async (url, options) => url === 'blob:fixture'
      ? { ok: true, blob: async () => new Blob(['image fixture']) }
      : (body = options.body, response()) });
  await upload({ uri: 'blob:fixture', name: 'photo.png' }, authorization);
  assert.equal(await body.get('file').text(), 'image fixture');
});
test('native upload retains the React Native URI descriptor', async () => {
  const fields = new Map();
  class NativeFormData { append(key, value) { fields.set(key, value); } }
  const upload = loadHelper('cloudinaryUpload', { Platform: { OS: 'android' }, FormData: NativeFormData, fetch: async () => response() });
  await upload({ uri: 'file:///qa.pdf', mimeType: 'application/pdf', name: 'qa.pdf' }, authorization);
  assert.equal(fields.get('file').uri, 'file:///qa.pdf');
  assert.equal(fields.get('file').type, 'application/pdf');
});

test('protected endorsement uploads include authenticated delivery type', async () => {
  let body;
  const upload = loadHelper('cloudinaryUpload', { Platform: { OS: 'web' }, FormData,
    fetch: async (url, options) => { body = options.body; return response(); } });
  await upload({ file: new Blob(['signed letter']), name: 'letter.pdf' }, { ...authorization, deliveryType: 'authenticated' });
  assert.equal(body.get('type'), 'authenticated');
  assert.equal(body.get('signature'), 'signed');
});
test('failed uploads preserve the server error rather than returning success', async () => {
  const upload = loadHelper('cloudinaryUpload', { Platform: { OS: 'web' }, FormData,
    fetch: async () => ({ ok: false, json: async () => ({ error: { message: 'Invalid signature' } }) }) });
  await assert.rejects(upload({ file: new Blob(['test']), name: 'qa.pdf' }, authorization), /Invalid signature/);
});
test('web submission feedback executes the next-screen action after dismissal', () => {
  let alerted = false;
  let navigated = false;
  const alert = loadHelper('studentAlert', { Platform: { OS: 'web' }, window: { alert: () => { alerted = true; } } });
  alert.alert('Submitted', 'Ready', [{ text: 'View status', onPress: () => { assert.equal(alerted, true); navigated = true; } }]);
  assert.equal(navigated, true);
});
test('web removal cancellation does not execute the destructive callback', () => {
  let removed = false;
  const alert = loadHelper('studentAlert', { Platform: { OS: 'web' }, window: { confirm: () => false } });
  alert.alert('Remove?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => { removed = true; } }]);
  assert.equal(removed, false);
});
test('dashboard uses the actual final-review record instead of an outdated pending profile flag', () => {
  const next = loadHelper('preDeploymentStatus', {}, 'nextPreDeploymentAction');
  const profile = { accountApproved: true, requirementsStatus: 'approved', placementStatus: 'approved', preDeploymentStatus: 'pending_review' };
  assert.equal(next(profile, { review: { status: 'not_submitted' } }).route, 'Review');
  assert.equal(next(profile, { review: { status: 'pending_review' } }).route, 'Approval');
  assert.equal(next(profile, { review: { status: 'needs_revision' } }).route, 'Review');
});
test('dashboard directs incomplete documents and placement to the correct step', () => {
  const next = loadHelper('preDeploymentStatus', {}, 'nextPreDeploymentAction');
  assert.equal(next({ accountApproved: true, requirementsStatus: 'needs_revision' }).route, 'Requirements');
  assert.equal(next({ accountApproved: true, requirementsStatus: 'approved', placementStatus: 'not_started' }).route, 'Company');
});
