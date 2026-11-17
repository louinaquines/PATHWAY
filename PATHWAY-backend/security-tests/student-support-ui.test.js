const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
function load(name, globals, exports) {
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/services', `${name}.js`), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({${exports}})`, { Date, setTimeout, clearTimeout, AbortController, ...globals });
}
const calendar = load('calendarDate', {}, 'parseCalendarDate,calendarDateValue');
test('missing hosted support context reports service unavailability and can recover on refresh', async () => {
  let available = false;
  const h = load('workplaceSupport', { ...calendar, requestBackend: async () => {
    if (!available) throw Object.assign(new Error('The request could not be completed.'), { status: 404 });
    return { available: true, coordinator: { name: 'Synthetic coordinator' } };
  } }, 'requestSupport');
  await assert.rejects(h.requestSupport('/student/workplace-support/context', { method: 'GET' }), /service is not available on this server/i);
  available = true;
  assert.equal((await h.requestSupport('/student/workplace-support/context', { method: 'GET' })).available, true);
});
test('missing individual report keeps its original not-found error', async () => {
  const h = load('workplaceSupport', { ...calendar, requestBackend: async () => {
    throw Object.assign(new Error('Report not found.'), { status: 404 });
  } }, 'requestSupport');
  await assert.rejects(h.requestSupport('/student/workplace-support/missing', { method: 'GET' }), /Report not found/);
});
function support(extra = {}) {
  const { uploadCloudinaryFile } = load('cloudinaryUpload', {}, 'uploadCloudinaryFile');
  return load('workplaceSupport', { ...calendar, uploadCloudinaryFile, auth: { currentUser: { uid: 'owner' } }, ...extra }, 'validateSupportDraft,createSupportDraft,philippineToday,loadSupportPage');
}
test('description trims mixed language; real calendar dates use Philippine today; file is optional', () => {
  const h = support();
  const valid = { description: '  Kailangan ko ng tulong 日本語  ', incidentDate: '2026-10-21', immediateSafety: true };
  assert.equal(h.validateSupportDraft(valid, '2026-10-21').description, undefined);
  for (const description of [' ', 'x'.repeat(8001)]) assert.ok(h.validateSupportDraft({ ...valid, description }, '2026-10-21').description);
  for (const incidentDate of ['2026-02-30', '2026-10-22', 'bad']) assert.ok(h.validateSupportDraft({ ...valid, incidentDate }, '2026-10-21').incidentDate);
  assert.equal(h.philippineToday(new Date('2026-10-20T16:01:00Z')), '2026-10-21');
  for (const file of [{ mimeType: 'text/plain', size: 1 }, { mimeType: 'application/pdf', size: 5242881 }, { mimeType: 'image/png' }]) assert.ok(h.validateSupportDraft({ ...valid, file }).file);
  for (const mimeType of ['application/pdf', 'image/jpeg', 'image/png']) assert.equal(h.validateSupportDraft({ ...valid, file: { mimeType, size: 5242880 } }).file, undefined);
});
test('double taps and response loss preserve text/file/errors and replay exactly the same POST', async () => {
  let release; let calls = [];
  const h = support();
  const draft = h.createSupportDraft({ uid: 'owner', requestId: () => 'retry-id', today: () => '2026-10-21', request: async (path, options) => {
    calls.push({ path, ...options });
    if (calls.length === 1) await new Promise(resolve => { release = resolve; });
    if (calls.length === 1) throw new Error('Response lost');
    return { id: 'report-1', status: 'Submitted' };
  } });
  draft.update({ description: '  Help po  ', immediateSafety: true });
  const first = draft.submit();
  await draft.submit();
  assert.equal(calls.length, 1);
  release(); await first;
  assert.equal(draft.state.description, '  Help po  ');
  assert.match(draft.state.error, /Response lost/);
  assert.equal(draft.state.result, null);
  draft.update({ description: 'changed' });
  await draft.submit();
  assert.equal(calls[0].payload.requestId, 'retry-id');
  assert.equal(JSON.stringify(calls[1].payload), JSON.stringify(calls[0].payload));
  assert.equal(calls[1].payload.description, 'Help po');
  assert.equal(draft.state.result.id, 'report-1');
  draft.update({ description: 'edit after report' }); await draft.submit();
  assert.equal(calls.length, 2); assert.equal(draft.state.description, '  Help po  ');
});
test('upload failure retains file; removal is explicit; missing recipient never submits', async () => {
  const file = { uri: 'file:///synthetic.pdf', mimeType: 'application/pdf', size: 10 };
  let posts = 0;
  const draft = support().createSupportDraft({ uid: 'owner', request: async () => { posts++; return { intentId: 'intent' }; }, upload: async () => { throw new Error('Upload failed'); } });
  draft.update({ description: 'help', file });
  await draft.submit(false); assert.equal(posts, 0); assert.equal(draft.state.file, file);
  await draft.submit(); assert.equal(draft.state.file, file); assert.match(draft.state.error, /Upload failed/); assert.equal(draft.state.result, null);
  draft.update({ file: null }); assert.equal(draft.state.file, null);
});
test('finalized attachment and request ID survive POST response loss without uploading twice', async () => {
  let uploads = 0; let posts = 0; const payloads = [];
  const draft = support().createSupportDraft({ uid: 'owner', upload: async () => { uploads++; return { version: 1, signature: 'receipt' }; }, request: async (path, options) => {
    if (path.endsWith('/intents')) return { intentId: 'intent' };
    if (path.endsWith('/finalize')) return { attachmentIntentId: 'intent', status: 'ready' };
    posts++; payloads.push(options.payload); if (posts === 1) throw new Error('timeout'); return { id: 'report', status: 'Submitted' };
  } });
  draft.update({ description: 'help', file: { mimeType: 'image/png', size: 1 } });
  await draft.submit(); await draft.submit();
  assert.equal(uploads, 1); assert.equal(payloads[0].attachmentIntentId, 'intent'); assert.equal(JSON.stringify(payloads[0]), JSON.stringify(payloads[1]));
});
test('account switch rejects late results and prevents old draft submission', async () => {
  const auth = { currentUser: { uid: 'owner' } }; let release;
  const draft = support({ auth }).createSupportDraft({ uid: 'owner', request: async () => { await new Promise(resolve => { release = resolve; }); return { id: 'private', status: 'Submitted' }; } });
  draft.update({ description: 'private text' }); const pending = draft.submit(); auth.currentUser = { uid: 'other' }; release(); await pending;
  assert.equal(draft.state.result, null); assert.equal(draft.state.description, '');
});
test('empty bounded page retains server continuation for explicit load more', async () => {
  let requested;
  const h = support({ requestBackend: async path => { requested = path; return { records: [], hasMore: true, cursor: 'opaque-next' }; } });
  const page = await h.loadSupportPage('notices', 'opaque/+');
  assert.equal(requested, '/student/workplace-support-notices?cursor=opaque%2F%2B');
  assert.equal(page.hasMore, true); assert.equal(page.cursor, 'opaque-next');
});
test('shared GET omits body and account changes during token/response waits reject private results', async () => {
  let options; const user = { uid: 'owner', getIdToken: async () => 'token' }; const auth = { currentUser: user };
  const h = load('backendApi', { auth, process: { env: {} }, fetch: async (_, init) => { options = init; return { ok: true, json: async () => ({ records: [] }) }; } }, 'requestBackend');
  await h.requestBackend('/test', { method: 'GET' }); assert.equal(Object.hasOwn(options, 'body'), false);
  user.getIdToken = async () => { auth.currentUser = { uid: 'other' }; return 'token'; };
  await assert.rejects(h.requestBackend('/test', { method: 'GET' }), /sign in|session/i);
  auth.currentUser = user; user.getIdToken = async () => 'token';
  const late = load('backendApi', { auth, process: { env: {} }, fetch: async () => ({ ok: true, json: async () => { auth.currentUser = null; return { secret: true }; } }) }, 'requestBackend');
  await assert.rejects(late.requestBackend('/test', { method: 'GET' }), /sign in|session/i);
});
test('support request timeout aborts stalled transport so the preserved request can be retried', async () => {
  const auth = { currentUser: { getIdToken: async () => 'token' } };
  const h = load('backendApi', { auth, process: { env: {} }, fetch: async (_, options) => {
    if (!options.signal) return { ok: true, json: async () => ({ unexpected: true }) };
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timed out'))));
  } }, 'requestBackend');
  await assert.rejects(h.requestBackend('/test', { timeoutMs: 5 }), /timed out/i);
});
test('opening support notice only marks read then navigates; session switch prevents navigation', async () => {
  const auth = { currentUser: { uid: 'owner' } }; const calls = []; let destination;
  const helper = load('workplaceSupport', { ...calendar, auth }, 'openSupportNotice');
  const notice = { id: 'notice', reportId: 'report' };
  await helper.openSupportNotice(notice, { request: async (path, options) => { calls.push({ path, options }); return { success: true }; }, navigate: (...args) => { destination = args; } });
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/student/workplace-support-notices/notice/read');
  assert.equal(JSON.stringify(calls[0].options.payload), '{}'); assert.equal(destination[0], 'WorkplaceSupport'); assert.equal(destination[1].reportId, 'report');
  destination = null;
  await assert.rejects(helper.openSupportNotice(notice, { request: async () => { auth.currentUser = null; return { success: true }; }, navigate: () => { destination = true; } }), /session/i);
  assert.equal(destination, null);
});
test('private attachment transport receives Bearer authentication and suppresses results after account switch', async () => {
  const auth = { currentUser: { uid: 'owner', getIdToken: async () => 'private-token' } };
  const helper = load('workplaceSupport', { ...calendar, auth, BACKEND_URL: 'https://local.invalid' }, 'downloadSupportAttachment');
  const result = await helper.downloadSupportAttachment('report', async (url, headers) => {
    assert.equal(url, 'https://local.invalid/student/workplace-support/report/attachment');
    assert.equal(headers.Authorization, 'Bearer private-token'); return 'synthetic private bytes';
  });
  assert.equal(result, 'synthetic private bytes');
  await assert.rejects(helper.downloadSupportAttachment('report', async () => { auth.currentUser = null; return 'secret'; }), /session/i);
});
test('failed send retains all input and validation errors until explicit clear removes the entire draft', async () => {
  const draft = support().createSupportDraft({ uid: 'owner', upload: async () => { throw new Error('offline'); }, request: async () => ({ intentId: 'intent' }) });
  const file = { uri: 'file:///synthetic.png', name: 'synthetic.png', mimeType: 'image/png', size: 3 };
  draft.update({ description: '  Tulong 日本語  ', incidentDate: '2026-02-30', immediateSafety: true, file });
  await draft.submit(); assert.ok(draft.state.errors.incidentDate);
  assert.equal(draft.state.description, '  Tulong 日本語  '); assert.equal(draft.state.file, file);
  draft.update({ incidentDate: '2026-01-01' }); await draft.submit();
  assert.match(draft.state.error, /offline/); assert.equal(draft.state.immediateSafety, true); assert.equal(draft.state.incidentDate, '2026-01-01');
  draft.clear();
  assert.equal(draft.state.description, ''); assert.equal(draft.state.file, null); assert.equal(draft.state.incidentDate, '');
  assert.equal(draft.state.error, ''); assert.equal(Object.keys(draft.state.errors).length, 0); assert.equal(draft.state.pending, false); assert.equal(draft.state.result, null);
});
test('uncertain delivery can be confirmed with the same key even if refreshed recipient is unavailable', async () => {
  let attempts = 0; const ids = [];
  const draft = support().createSupportDraft({ uid: 'owner', request: async (_, options) => {
    attempts++; ids.push(options.payload.requestId); if (attempts === 1) throw new Error('lost response'); return { id: 'already-sent', status: 'Submitted' };
  } });
  draft.update({ description: 'help' }); await draft.submit(); await draft.submit(false);
  assert.equal(draft.state.result?.id, 'already-sent'); assert.equal(ids[0], ids[1]);
});
test('definitive server validation rejection preserves input and allows correction, while unchanged retry retains its key', async () => {
  const payloads = []; let nextId = 0;
  const draft = support().createSupportDraft({ uid: 'owner', requestId: () => `request-${++nextId}`, request: async (_, options) => {
    payloads.push(options.payload); if (payloads.length < 3) throw Object.assign(new Error('Validation rejected'), { status: 400 }); return { id: 'accepted', status: 'Submitted' };
  } });
  draft.update({ description: 'first' }); await draft.submit();
  assert.equal(draft.state.description, 'first'); assert.equal(draft.state.pending, false); await draft.submit();
  assert.equal(payloads[0].requestId, payloads[1].requestId);
  draft.update({ description: 'corrected' }); await draft.submit();
  assert.equal(payloads[2].description, 'corrected'); assert.notEqual(payloads[2].requestId, payloads[1].requestId);
});

test('support upload timeout releases sending and preserves draft/file when provider or receipt body stalls', async () => {
  for (const stage of ['upload', 'body', 'local-file']) {
    let signal;
    const { uploadCloudinaryFile } = load('cloudinaryUpload', { Platform: { OS: 'web' }, FormData,
      fetch: async (_, options) => {
        signal = options?.signal;
        if (stage === 'upload' || stage === 'local-file') return new Promise(() => {});
        return { ok: true, json: () => new Promise(() => {}) };
      },
    }, 'uploadCloudinaryFile');
    const file = { uri: 'blob:synthetic', name: 'synthetic.png', mimeType: 'image/png', size: 3, ...(stage !== 'local-file' ? { file: new Blob(['png']) } : {}) };
    const draft = support().createSupportDraft({ uid: 'owner', request: async () => ({ intentId: 'intent', uploadUrl: 'https://provider.invalid' }),
      upload: (asset, signed, options) => uploadCloudinaryFile(asset, signed, { ...options, timeoutMs: options?.timeoutMs ? 5 : 0 }),
    });
    draft.update({ description: 'help', file });
    await Promise.race([draft.submit(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Unbounded ${stage}`)), 150))]);
    assert.match(draft.state.error, /timed out/i); assert.equal(signal.aborted, true);
    assert.equal(draft.state.sending, false); assert.equal(draft.state.pending, false); assert.equal(draft.state.file, file); assert.equal(draft.state.description, 'help');
    draft.update({ description: 'can edit after upload failure' }); assert.equal(draft.state.description, 'can edit after upload failure');
  }
});
test('backend response body timeout rejects rather than returning partial success when body ignores abort', async () => {
  const auth = { currentUser: { getIdToken: async () => 'token' } };
  const { requestBackend } = load('backendApi', { auth, process: { env: {} }, fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) }, 'requestBackend');
  await assert.rejects(Promise.race([requestBackend('/test', { timeoutMs: 5 }), new Promise((_, reject) => setTimeout(() => reject(new Error('Unbounded body')), 100))]), /timed out/i);
});
test('date-only and safety-only drafts require discard confirmation; empty and submitted drafts do not', () => {
  const { hasUnsubmittedSupportDraft: guarded } = load('workplaceSupport', {}, 'hasUnsubmittedSupportDraft');
  assert.equal(guarded({ incidentDate: '2026-10-21' }), true);
  assert.equal(guarded({ immediateSafety: true }), true);
  assert.equal(guarded({}), false); assert.equal(guarded({ incidentDate: '2026-10-21', result: { id: 'sent' } }), false);
});

test('only confirmed uncommitted attachment rejection unlocks the retained draft for explicit removal', async () => {
  for (const reason of [undefined, 'attachment_uncommitted']) {
    let count = 0; const payloads = [];
    const file = { mimeType: 'application/pdf', size: 10 };
    const draft = support().createSupportDraft({ uid: 'owner', requestId: () => `renew-${++count}`, upload: async () => ({ version: 1 }),
      request: async (path, options) => {
        if (path.endsWith('/intents')) return { intentId: 'expired' };
        if (path.endsWith('/finalize')) return { attachmentIntentId: 'expired' };
        payloads.push(options.payload);
        if (payloads.length === 1) throw Object.assign(Error('Expired'), { status: 409, reason });
        return { id: 'accepted', status: 'Submitted' };
      } });
    draft.update({ description: 'Keep my words', file }); await draft.submit();
    assert.equal(draft.state.pending, reason !== 'attachment_uncommitted');
    assert.equal(draft.state.file, file); assert.equal(draft.state.description, 'Keep my words');
    draft.update({ file: null }); await draft.submit();
    assert.equal(payloads[1].attachmentIntentId, reason ? undefined : 'expired');
    assert.equal(payloads[1].requestId === payloads[0].requestId, !reason);
  }
});

test('backend projects confirmed uncommitted attachment reason without changing status', async () => {
  const auth = { currentUser: { getIdToken: async () => 'token' } };
  const { requestBackend } = load('backendApi', { auth, process: { env: {} }, fetch: async () => ({ ok: false, status: 409,
    json: async () => ({ error: 'Expired', reason: 'attachment_uncommitted' }) }) }, 'requestBackend');
  await assert.rejects(requestBackend('/test'), error => error.status === 409 && error.reason === 'attachment_uncommitted');
});
