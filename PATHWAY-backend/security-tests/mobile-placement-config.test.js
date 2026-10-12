const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const read = file => readFileSync(path.join(__dirname, '../../PATHWAY-master', file), 'utf8');

test('home avatar alone uses 60px and both startup taglines use OJT MANAGEMENT', () => {
  const dashboard = read('screens/StudentDashboard.js');
  assert.match(dashboard, /homeAvatar: \{ width: 60, height: 60, borderRadius: 30/);
  assert.match(dashboard, /homeAvatarImage: \{ width: '100%', height: '100%', borderRadius: 30/);
  const splash = read('components/AnimatedSplash.js');
  assert.equal((splash.match(/>OJT MANAGEMENT</g) || []).length, 2);
  assert.equal(splash.includes('STUDENT OJT PORTAL'), false);
});

test('placement changes disable new attendance and journal submissions without clearing notes', () => {
  const hook = read('services/usePlacementEligibility.js');
  assert.match(hook, /onSnapshot\(doc\(db, 'users'/);
  assert.match(hook, /onSnapshot\(doc\(db, 'companies'/);
  assert.match(hook, /profile.preDeploymentStatus === 'approved'/);
  assert.match(hook, /profile.clearanceStatus !== 'cleared'/);
  assert.match(hook, /data.active !== false && data.status !== 'inactive'/);
  const logs = read('screens/LogbookScreen.js');
  assert.match(logs, /disabled=\{saving \|\| !eligible \|\| !rawNotes.trim\(\) \|\| !hours\}/);
  assert.match(logs, /disabled=\{!eligible\} onPress=\{event/);
  assert.equal(hook.includes('setRawNotes'), false);
  assert.match(read('screens/StudentDashboard.js'), /onPress=\{handleTimeIn\} disabled=\{saving \|\| !eligible\}/);
});
