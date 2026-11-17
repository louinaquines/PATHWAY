const { test } = require('node:test');
const assert = require('node:assert/strict');
const { exportFromPinnedHub } = require('./emulator-persistence');
test('backup addresses the pinned demo hub and verifies its services before export', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({url,options}); return Response.json(options?.method === 'POST' ? { message:'OK' } : {
    auth:{host:'127.0.0.1',port:9099}, firestore:{host:'127.0.0.1',port:8080} }); };
  await exportFromPinnedHub('synthetic-destination',fetchImpl);
  assert.equal(calls[0].url,'http://127.0.0.1:4400/emulators');
  assert.equal(calls[1].url,'http://127.0.0.1:4400/_admin/export');
  assert.deepEqual(JSON.parse(calls[1].options.body).targets,['auth','firestore']);
});
test('wrong emulator ports and unavailable hub never fall back to registry discovery', async () => {
  let calls=0;
  await assert.rejects(exportFromPinnedHub('synthetic-destination',async()=>{ calls++; return Response.json({auth:{host:'127.0.0.1',port:9199},firestore:{host:'127.0.0.1',port:8180}}); }),/demo/);
  assert.equal(calls,1);
  await assert.rejects(exportFromPinnedHub('synthetic-destination',async()=>{ throw Error('unavailable'); }),/unavailable/);
});
