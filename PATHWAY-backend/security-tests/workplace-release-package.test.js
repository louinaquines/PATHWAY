const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const create = () => require('../workplaceReleasePackage');

test('release manifest freezes exact source hashes without treating preparation as deployment approval', () => {
  const manifest = create().buildWorkplaceReleaseManifest({ root, now: new Date('2026-10-24T00:00:00Z') });
  assert.equal(manifest.processingEnabled, false); assert.equal(manifest.readyForDeployment, false);
  assert.equal(manifest.currentAndroidBuild, 8); assert.equal(manifest.candidateAndroidBuild, 9);
  assert.equal(manifest.candidateJournalBackendSubmission, '1');
  assert.ok(manifest.files.length >= 8);
  for (const file of manifest.files) assert.match(file.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.sourceRevision, 'sha256-content-manifest');
  assert.ok(manifest.blockers.includes('installed-client-not-verified'));
});

test('client contract cannot block older submissions until every release gate is explicitly verified', () => {
  const assess = create().assessJournalClientContract;
  const prepared = assess({ candidateBuild: 8, installedBuild: 7 });
  assert.equal(prepared.contractAllowed, false); assert.equal(prepared.blockOlderSubmissions, false);
  const all = { candidateBuild: 8, installedBuild: 7, updatedClientAvailable: true, nativeReleaseVerified: true,
    updateNoticeReady: true, installedInventoryReviewed: true, staffApiVerified: true, rollbackVerified: true, ownerApproved: true };
  const approved = assess(all);
  assert.equal(approved.contractAllowed, true); assert.equal(approved.blockOlderSubmissions, true);
  assert.equal(approved.updateRequired, true);
  for (const key of ['updatedClientAvailable','nativeReleaseVerified','updateNoticeReady','installedInventoryReviewed','staffApiVerified','rollbackVerified','ownerApproved']) {
    assert.equal(assess({ ...all, [key]: false }).blockOlderSubmissions, false, key);
  }
  assert.equal(assess({ ...all, installedBuild: 8 }).updateRequired, false);
  assert.equal(assess({ ...all, installedBuild: undefined }).updateRequired, true);
});

test('release manifest verification detects content or version drift without approving deployment', () => {
  const { buildWorkplaceReleaseManifest, verifyWorkplaceReleaseManifest } = create();
  const manifest = buildWorkplaceReleaseManifest({ root, now: new Date('2026-10-24T00:00:00Z') });
  assert.equal(verifyWorkplaceReleaseManifest({ root, manifest }).matches, true);
  const changedHash = { ...manifest, files: manifest.files.map((file, index) => index ? file : { ...file, sha256: '0'.repeat(64) }) };
  assert.equal(verifyWorkplaceReleaseManifest({ root, manifest: changedHash }).matches, false);
  assert.equal(verifyWorkplaceReleaseManifest({ root, manifest: { ...manifest, candidateAndroidBuild: manifest.candidateAndroidBuild + 1 } }).matches, false);
  assert.equal(verifyWorkplaceReleaseManifest({ root, manifest: { ...manifest, readyForDeployment: true } }).matches, false);
  assert.equal(verifyWorkplaceReleaseManifest({ root, manifest: null }).readyForDeployment, false);
});

test('every safety-critical dependency is frozen and any changed bytes invalidate the saved package', () => {
  const fs = require('node:fs');
  const { buildWorkplaceReleaseManifest, verifyWorkplaceReleaseManifest } = create();
  const manifest = buildWorkplaceReleaseManifest({ root });
  const dependencies = ['workplaceHostedWake.js','workplaceJournalWorker.js','workplaceGeneralProvider.js','workplaceAnalysisPricing.js',
    'workplaceAnalysisBudget.js','workplaceRealUsePolicy.js','workplaceClaudeAdapter.js','workplaceConcernDetector.js','workplaceConcernCases.js','workplaceReleasePackage.js'];
  const real = fs.readFileSync;
  for (const name of dependencies) {
    const target = path.join(root, 'PATHWAY-backend', name);
    let read = false;
    fs.readFileSync = function(file, ...args) {
      const bytes = real.call(this, file, ...args);
      if (typeof file === 'string' && path.resolve(file) === target) { read = true; return Buffer.concat([Buffer.from(bytes), Buffer.from('\n// synthetic changed dependency\n')]); }
      return bytes;
    };
    try {
      assert.equal(verifyWorkplaceReleaseManifest({ root, manifest }).matches, false, name);
      assert.equal(read, true, name);
    } finally { fs.readFileSync = real; }
  }
});

test('malformed policy inputs fail closed without throwing or inheriting approval', () => {
  const { assessJournalClientContract } = create();
  for (const evidence of [null, [], false, 42, 'approved']) {
    const result = assessJournalClientContract(evidence);
    assert.equal(result.contractAllowed, false); assert.equal(result.blockOlderSubmissions, false);
    assert.equal(result.changesApplied, false);
  }
  const inherited = Object.create({ candidateBuild: 8, updatedClientAvailable: true, nativeReleaseVerified: true,
    updateNoticeReady: true, installedInventoryReviewed: true, staffApiVerified: true, rollbackVerified: true, ownerApproved: true });
  assert.equal(assessJournalClientContract(inherited).contractAllowed, false);
});

test('manifest blocker removal, replacement or duplication invalidates verification', () => {
  const { buildWorkplaceReleaseManifest, verifyWorkplaceReleaseManifest } = create();
  const manifest = buildWorkplaceReleaseManifest({ root });
  for (const blockers of [undefined, [], ['approved'], [...manifest.blockers, manifest.blockers[0]]]) {
    const result = verifyWorkplaceReleaseManifest({ root, manifest: { ...manifest, blockers } });
    assert.equal(result.matches, false); assert.equal(result.readyForDeployment, false);
    assert.equal(result.processingEnabled, false);
  }
});
