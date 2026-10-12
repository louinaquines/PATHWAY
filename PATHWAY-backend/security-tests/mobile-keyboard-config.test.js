const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '../../PATHWAY-master');
test('Android release explicitly resizes for the keyboard', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, 'app.json'))).expo.android.softwareKeyboardLayoutMode, 'resize');
});
test('student form screens configure avoidance on both native platforms', () => {
  for (const screen of ['LoginScreen', 'ForgotPasswordScreen', 'RegisterScreen', 'ChangePasswordScreen', 'CompanyScreen', 'LogbookScreen', 'NotificationsScreen']) {
    const source = fs.readFileSync(path.join(app, 'screens', `${screen}.js`), 'utf8');
    assert.ok(source.includes("Platform.OS === 'ios' ? 'padding' : 'height'"), screen);
  }
});
test('chat uses one avoidance layer, without manual overlap compensation', () => {
  const source = fs.readFileSync(path.join(app, 'screens/NotificationsScreen.js'), 'utf8');
  assert.equal((source.match(/<KeyboardAvoidingView\b/g) || []).length, 1);
  assert.ok(!source.includes('keyboardOverlap'));
  assert.ok(source.includes('keyboardShouldPersistTaps="handled"'));
});
