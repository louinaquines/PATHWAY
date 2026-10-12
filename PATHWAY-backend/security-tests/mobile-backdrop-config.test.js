const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../PATHWAY-master');
test('dim overlays use shared independent backdrop transitions', () => {
  for (const name of ['screens/LogbookScreen.js', 'screens/RegisterScreen.js', 'screens/NotificationsScreen.js',
    'components/PlacementDateField.js', 'components/PreDeploymentDrawer.js',
    'components/PreDeploymentNotificationsSheet.js', 'components/StudentDialogHost.js', 'components/StudentSuccessHost.js']) {
    assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /import Modal from .*BackdropModal/);
  }
  const source = fs.readFileSync(path.join(root, 'components/BackdropModal.js'), 'utf8');
  assert.match(source, /animationType="none"/);
  assert.match(source, /StyleSheet.absoluteFillObject/);
  assert.match(source, /backgroundColor: 'transparent'/);
  assert.match(source, /animation.stop\(\)/);
  assert.match(source, /useReducedMotion/);
});
