const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('Docker-packaged journal, document, DTR and support modules load with their runtime dependencies', () => {
  const backend = path.resolve(__dirname, '..');
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-journal-package-'));
  try {
    for (const line of fs.readFileSync(path.join(backend, 'Dockerfile'), 'utf8').split(/\r?\n/)) {
      if (!line.startsWith('COPY ')) continue;
      for (const name of line.split(/\s+/).slice(1, -1)) {
        if (/^[A-Za-z0-9]+\.js$/.test(name)) fs.copyFileSync(path.join(backend, name), path.join(target, name));
      }
    }
    const result = spawnSync(process.execPath, ['-e', "require('./anthropicAnalysis'); require('./journalAiReview'); require('./workplaceJournalConsent'); require('./studentJournalSubmission'); require('./workplaceDispatchBootstrap'); require('./workplaceConcernReview'); require('./documentTriage'); require('./dtrReview'); require('./workplaceSupport'); require('./workplaceSupportAttachments'); require('./workplaceSupportWorkflow');"], {
      cwd: target, encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_PATH: path.join(backend, 'node_modules') },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
