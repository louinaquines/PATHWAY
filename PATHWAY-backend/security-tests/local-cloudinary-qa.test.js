const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadLocalCloudinaryQa } = require('../localCloudinaryQa');

test('production is unchanged and unconfirmed QA cannot inherit production credentials', () => {
  const production = { CLOUDINARY_API_SECRET: 'production' };
  assert.equal(loadLocalCloudinaryQa(production, () => { throw new Error('must not read'); }), false);
  assert.equal(production.CLOUDINARY_API_SECRET, 'production');
  const demo = { PATHWAY_LOCAL_WORKFLOW: '1', CLOUDINARY_API_SECRET: 'production' };
  assert.equal(loadLocalCloudinaryQa(demo, () => 'PATHWAY_CLOUDINARY_QA_CONFIRMED=0'), false);
  assert.equal(demo.CLOUDINARY_API_SECRET, undefined);
});

test('confirmed QA loads only cloud credentials, not Firebase or provider overrides', () => {
  const demo = { PATHWAY_LOCAL_WORKFLOW: '1' };
  assert.equal(loadLocalCloudinaryQa(demo, () => 'PATHWAY_CLOUDINARY_QA_CONFIRMED=1\nCLOUDINARY_CLOUD_NAME=qa-cloud\nCLOUDINARY_API_KEY=123456\nCLOUDINARY_API_SECRET=test-secret\nGOOGLE_CLOUD_PROJECT=production\nCLOUDINARY_API_BASE_URL=https://wrong.invalid'), true);
  assert.equal(demo.CLOUDINARY_CLOUD_NAME, 'qa-cloud');
  assert.equal(demo.GOOGLE_CLOUD_PROJECT, undefined);
  assert.equal(demo.CLOUDINARY_API_BASE_URL, undefined);
});

test('missing QA file stays disabled; incomplete confirmed configuration fails closed', () => {
  assert.equal(loadLocalCloudinaryQa({ PATHWAY_LOCAL_WORKFLOW: '1' }, () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }), false);
  assert.throws(() => loadLocalCloudinaryQa({ PATHWAY_LOCAL_WORKFLOW: '1' }, () => 'PATHWAY_CLOUDINARY_QA_CONFIRMED=1'), /Complete/);
});
