const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const persistence = require('./emulator-persistence');

const PROJECT_ID = 'demo-pathway-security';
const backendDir = path.resolve(__dirname, '..');
const mobileDir = path.resolve(backendDir, '..', 'PATHWAY-master');
const firebaseCli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
const ports = [8080, 9099, 3100, 8083, 3001];
const portServices = new Map([
  [8080, 'Firestore emulator'],
  [9099, 'Auth emulator'],
  [3100, 'local backend'],
  [8083, 'student app'],
  [3001, 'staff portal'],
]);
let child;
let stopping = false;

function canConnect(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (child && child.exitCode === null && child.pid) {
    if (process.platform === 'win32') {
      // Firebase CLI owns the emulator lifecycle and performs its own teardown.
      child.kill('SIGINT');
      setTimeout(() => {
        if (child.exitCode === null) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        }
      }, 15000).unref();
    } else {
      child.kill('SIGINT');
    }
  }
}

async function main() {
  const expoCli = path.join(mobileDir, 'node_modules', 'expo', 'bin', 'cli');
  if (!fs.existsSync(expoCli)) throw new Error('Expo CLI was not found. Install PATHWAY-master dependencies first.');
  for (const port of ports) {
    if (await canConnect(port)) {
      throw new Error([
        `Port ${port} (${portServices.get(port)}) is already in use. This launcher will not terminate an existing process.`,
        'If another PATHWAY workflow terminal is still running, keep using it; the student UI now refreshes when you save code.',
        'To stop that workflow, press Ctrl+C in its active terminal. Ctrl+C at a PowerShell prompt cannot stop a background service.',
        `If no workflow terminal is running, inspect the current owner with: netstat -ano | findstr ":${port}"`,
        'Only stop the listener after verifying it belongs to this PATHWAY local demo workflow.',
      ].join('\n'));
    }
  }

  const restored = persistence.latestSnapshot();
  if (restored) console.log('Restoring saved local QA data; startup seeding will be skipped.');
  const env = {
    ...process.env,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_EMULATORS_PATH: path.join(backendDir, '.firebase-cache'),
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    PATHWAY_LOCAL_WORKFLOW: '1',
    PATHWAY_EMULATOR_RESTORED: restored ? '1' : '0',
  };
  child = spawn(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--config', '../firebase.json',
    '--project', PROJECT_ID,
    '--only', 'auth,firestore',
    ...(restored ? ['--import', restored] : []),
    `--export-on-exit=${persistence.snapshotPath()}`,
    'node security-tests/start-local-workflow-apps.js',
  ], {
    cwd: backendDir,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', error => {
    console.error(`Firebase emulator launcher failed: ${error.message}`);
    stop(1);
  });
  child.once('exit', code => {
    if (!stopping) process.exitCode = code ?? 1;
    stopping = true;
  });
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));
main().catch(error => {
  console.error(error.message || error);
  stop(1);
});
