const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-firebase-cli-'));
const firebaseCli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
const riskFiles = ['security-tests/attendance-risk-alerts.test.js', 'security-tests/attendance-risk-schedule.test.js', 'security-tests/attendance-schedule-client.test.js'];
const budgetFiles = ['security-tests/workplace-analysis-budget.test.js'];
const journalMigrationFiles = ['security-tests/workplace-journal-consent.test.js', 'security-tests/student-journal-submission.test.js'];
const workerFiles = ['security-tests/workplace-analysis-pricing.test.js', 'security-tests/workplace-journal-worker.test.js'];
const concernFiles = ['security-tests/workplace-concern-detector.test.js', 'security-tests/workplace-concern-cases.test.js', 'security-tests/workplace-concern-review.test.js'];
const claudeFiles = ['security-tests/workplace-general-input.test.js', 'security-tests/workplace-claude-adapter.test.js', 'security-tests/workplace-claude-pilot.test.js', 'security-tests/workplace-claude-workflow.test.js'];
const dispatchFiles = ['security-tests/workplace-local-dispatch.test.js', 'security-tests/workplace-local-flow.test.js'];
const controlledFiles = ['security-tests/workplace-controlled-dispatch.test.js', 'security-tests/workplace-controlled-flow.test.js', 'security-tests/workplace-dispatch-bootstrap.test.js'];
const retentionFiles = ['security-tests/workplace-concern-retention.test.js', 'security-tests/workplace-concern-cleanup.test.js'];
const generalFiles = ['security-tests/workplace-general-runtime.test.js', 'security-tests/workplace-general-runtime-flow.test.js'];
const testFiles = process.argv.includes('--workplace-concerns-only') ? [...workerFiles, ...concernFiles] : process.argv.includes('--workplace-worker-only') ? workerFiles : process.argv.includes('--journal-migration-only') ? journalMigrationFiles : process.argv.includes('--workplace-budget-only') ? budgetFiles : process.argv.includes('--risk-only') ? riskFiles : process.argv.includes('--attendance-only') ? ['security-tests/attendance-excused-security.test.js'] : ['security-tests/security.test.js', 'security-tests/attendance-excused-security.test.js', ...riskFiles, ...budgetFiles, ...journalMigrationFiles, ...workerFiles, ...concernFiles];
const testCommand = process.argv.includes('--workplace-ui-only')
  ? 'node --test --test-concurrency=1 --test-name-pattern="local workplace review API" security-tests/security.test.js'
  : process.argv.includes('--attendance-api')
  ? 'node --test --test-concurrency=1 --test-name-pattern="attendance excused API" security-tests/security.test.js'
  : process.argv.includes('--workplace-controlled-only') ? `node --test --test-concurrency=1 ${controlledFiles.join(' ')}`
  : process.argv.includes('--workplace-general-only') ? `node --test --test-concurrency=1 ${generalFiles.join(' ')}`
  : process.argv.includes('--workplace-review-only') ? 'node --test --test-concurrency=1 security-tests/workplace-concern-review.test.js'
  : `node --test --test-concurrency=1 ${(process.argv.includes('--workplace-cleanup-only') ? retentionFiles : process.argv.includes('--workplace-safeguards-only') ? [...retentionFiles, 'security-tests/workplace-concern-review.test.js', ...dispatchFiles] : process.argv.includes('--workplace-dispatch-only') ? dispatchFiles : process.argv.includes('--workplace-claude-only') ? claudeFiles : [...testFiles, ...claudeFiles, ...dispatchFiles, ...retentionFiles, ...controlledFiles, ...generalFiles]).join(' ')}`;
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
