const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PROJECT_ID = 'demo-pathway-security';
const backendDir = path.resolve(__dirname, '..');
const mobileDir = path.resolve(backendDir, '..', 'PATHWAY-master');
const firebaseCli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib', 'bin', 'firebase.js');
const ports = [8080, 9099, 3100, 8083, 3001];
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
      throw new Error(`Port ${port} is already in use. Stop that local service, then retry; this launcher will not terminate existing processes.`);
    }
  }

  const env = {
    ...process.env,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    FIREBASE_EMULATORS_PATH: path.join(backendDir, '.firebase-cache'),
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
    PATHWAY_LOCAL_WORKFLOW: '1',
  };
  child = spawn(process.execPath, [
    firebaseCli,
    'emulators:exec',
    '--config', '../firebase.json',
    '--project', PROJECT_ID,
    '--only', 'auth,firestore',
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
