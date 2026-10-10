const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('staff workflow uses Vite on the accepted demo origin', () => {
  const source = fs.readFileSync(path.join(__dirname, 'start-local-workflow-apps.js'), 'utf8');
  assert.match(source, /'node_modules', 'vite', 'bin', 'vite\.js'/);
  assert.match(source, /portalCli, '--host', '127\.0\.0\.1', '--port', '3001', '--strictPort'/);
  assert.doesNotMatch(source, /react-scripts/);
});

test('demo backend launches without automatic dependency restarts', () => {
  const source = fs.readFileSync(path.join(__dirname, 'start-local-workflow-apps.js'), 'utf8');
  assert.match(source, /launch\('PATHWAY backend \(stable local emulator mode\)', process\.execPath, \['server\.js'\]/);
  assert.doesNotMatch(source, /\['--watch', 'server\.js'\]/);
  assert.match(source, /Restart the workflow intentionally after backend edits/);
});

test('stable startup retains snapshot restore and frontend refresh', () => {
  const launcher = fs.readFileSync(path.join(__dirname, 'start-emulator-workflow.js'), 'utf8');
  const apps = fs.readFileSync(path.join(__dirname, 'start-local-workflow-apps.js'), 'utf8');
  assert.match(launcher, /persistence\.latestSnapshot\(\)/);
  assert.match(launcher, /\['--import', restored\]/);
  assert.match(apps, /PATHWAY_EMULATOR_RESTORED === '1'/);
  assert.match(apps, /expoCli, 'start', '--web', '--localhost', '--port', '8083'/);
});
