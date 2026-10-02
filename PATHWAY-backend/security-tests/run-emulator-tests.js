const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-firebase-cli-'));
const firebaseCli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
const testCommand = 'node --test --test-concurrency=1 security-tests/security.test.js';
const emulatorCache = path.join(__dirname, '..', '.firebase-cache');
const rootDir = path.resolve(__dirname, '..', '..');
const ports = {
  auth: Number(process.env.PATHWAY_AUTH_PORT || 9199),
  firestore: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180),
  hub: Number(process.env.PATHWAY_EMULATOR_HUB_PORT || 4490),
  logging: Number(process.env.PATHWAY_EMULATOR_LOGGING_PORT || 4590),
};
if (Object.values(ports).some(port => !Number.isSafeInteger(port) || port < 1024 || port > 65535)) {
  throw new Error('PATHWAY emulator test ports must be valid TCP port numbers.');
}
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'firebase.json'), 'utf8'));
firebaseConfig.firestore.rules = path.join(rootDir, firebaseConfig.firestore.rules);
firebaseConfig.emulators.auth = { ...firebaseConfig.emulators.auth, host: '127.0.0.1', port: ports.auth };
firebaseConfig.emulators.firestore = { ...firebaseConfig.emulators.firestore, host: '127.0.0.1', port: ports.firestore };
firebaseConfig.emulators.hub = { host: '127.0.0.1', port: ports.hub };
firebaseConfig.emulators.logging = { host: '127.0.0.1', port: ports.logging };
const testFirebaseConfig = path.join(configHome, 'firebase.json');
fs.writeFileSync(testFirebaseConfig, JSON.stringify(firebaseConfig, null, 2));

try {
  const result = spawnSync(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--config', testFirebaseConfig,
    '--project', 'demo-pathway-security',
    '--only', 'auth,firestore',
    testCommand,
  ], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      FIREBASE_EMULATORS_PATH: emulatorCache,
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
      PATHWAY_LOCAL_WORKFLOW: '1',
      PATHWAY_AUTH_PORT: String(ports.auth),
      PATHWAY_FIRESTORE_PORT: String(ports.firestore),
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(configHome, { recursive: true, force: true });
}
