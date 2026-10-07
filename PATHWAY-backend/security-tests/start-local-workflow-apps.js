const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ID = 'demo-pathway-security';
const backendDir = path.resolve(__dirname, '..');
const mobileDir = path.resolve(backendDir, '..', 'PATHWAY-master');
const portalDir = path.resolve(backendDir, '..', 'PATHWAY-web');
const children = [];
let stopping = false;

function canConnect(port) {
  return new Promise(resolve => {
    const socket = require('node:net').createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, child, label, timeoutMs = 90000) {
  const attempts = Math.ceil(timeoutMs / 300);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${label} stopped before port ${port} became ready.`);
    if (await canConnect(port)) return;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not start listening on port ${port} within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function waitForBackend(child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('The local backend stopped before becoming healthy.');
    try {
      const response = await fetch('http://127.0.0.1:3100/healthz');
      if (response.ok) return;
    } catch (_) { /* the backend is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('The local backend did not become healthy within 30 seconds.');
}

function launch(name, executable, args, cwd, env) {
  const child = spawn(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  child.workflowName = name;
  child.once('error', error => {
    console.error(`${name} failed to start: ${error.message}`);
    shutdown(1);
  });
  child.once('exit', code => {
    if (stopping) return;
    console.log(`${name} exited${code === null ? '' : ` with code ${code}`}.`);
    shutdown(code || 0);
  });
  children.push(child);
  return child;
}

function stopChild(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of [...children].reverse()) stopChild(child);
  setTimeout(() => process.exit(code), 500).unref();
}

async function main() {
  if (process.env.PATHWAY_LOCAL_WORKFLOW !== '1'
    || process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') {
    throw new Error('Refusing to run: this workflow requires the pinned local PATHWAY demo emulators.');
  }

  const seeded = process.env.PATHWAY_EMULATOR_RESTORED === '1' ? { status: 0 } : spawnSync(process.execPath, [path.join(__dirname, 'seed-workflow-emulator.js')], {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (seeded.error) throw seeded.error;
  if (seeded.status !== 0) throw new Error('Could not seed the demo accounts and workflow fixtures.');
  const stopBackups = require('./emulator-persistence').watch();
  process.once('exit', stopBackups);

  const expoCli = path.join(mobileDir, 'node_modules', 'expo', 'bin', 'cli');
  if (!fs.existsSync(expoCli)) throw new Error('Expo CLI was not found. Install PATHWAY-master dependencies first.');
  const expoEnvironment = {
    ...process.env,
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    EXPO_PUBLIC_BACKEND_URL: 'http://127.0.0.1:3100',
    EXPO_OFFLINE: '1',
    EXPO_NO_TELEMETRY: '1',
  };
  for (const key of [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
  ]) {
    delete expoEnvironment[key];
  }
  for (const key of Object.keys(expoEnvironment)) {
    if (key.startsWith('CLOUDINARY_')) delete expoEnvironment[key];
  }

  const backendEnvironment = {
    ...process.env,
    PATHWAY_LOCAL_WORKFLOW: '1',
    PATHWAY_CLOUDINARY_QA: '1',
    HOST: '127.0.0.1',
    PORT: '3100',
    CORS_ALLOWED_ORIGINS: 'http://localhost:8083,http://127.0.0.1:8083,http://localhost:3001,http://127.0.0.1:3001',
  };
  for (const key of ['ANTHROPIC_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS']) delete backendEnvironment[key];
  const backend = launch('PATHWAY backend (local emulator mode, live reload)', process.execPath, ['--watch', 'server.js'], backendDir, backendEnvironment);
  await waitForBackend(backend);

  const web = launch('PATHWAY student app (live reload, Firebase emulator mode)', process.execPath, [
    expoCli, 'start', '--web', '--localhost', '--port', '8083',
  ], mobileDir, expoEnvironment);
  await waitForPort(8083, web, 'PATHWAY local web app');

  const portalCli = path.join(portalDir, 'node_modules', 'react-scripts', 'scripts', 'start.js');
  if (!fs.existsSync(portalCli)) throw new Error('Web portal dependencies were not found. Install PATHWAY-web dependencies first.');
  const portalEnvironment = {
    ...process.env,
    BROWSER: 'none', HOST: '127.0.0.1', PORT: '3001',
    REACT_APP_LOCAL_EMULATOR: '1',
    REACT_APP_BACKEND_URL: 'http://127.0.0.1:3100',
    REACT_APP_FIREBASE_API_KEY: 'demo-key',
    REACT_APP_FIREBASE_AUTH_DOMAIN: 'demo-pathway-security.firebaseapp.com',
    REACT_APP_FIREBASE_PROJECT_ID: PROJECT_ID,
    REACT_APP_FIREBASE_STORAGE_BUCKET: 'demo-pathway-security.appspot.com',
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    REACT_APP_FIREBASE_APP_ID: '1:000000000000:web:demo',
  };
  for (const key of Object.keys(portalEnvironment)) {
    if (key.startsWith('CLOUDINARY_')) delete portalEnvironment[key];
  }
  const portal = launch('PATHWAY staff portal (local emulator mode)', process.execPath, [portalCli], portalDir, portalEnvironment);
  await waitForPort(3001, portal, 'PATHWAY staff portal');

  console.log('\nLocal-only test environment is ready. No production Firebase project is used.');
  console.log('Open http://localhost:8083 in this computer’s browser.');
  console.log('Staff portal: http://127.0.0.1:3001 (Auth and Firestore emulators only).');
  console.log('The student app is now served by Expo with Fast Refresh. Save UI files to see changes without restarting Firebase.');
  console.log('The backend also reloads when its source files change; keep this workflow terminal running.');
  if (process.env.PATHWAY_EMULATOR_RESTORED === '1') {
    console.log('Saved QA accounts and passwords retained. Use your existing credentials.');
  } else {
    console.log('Student: student.emulator@pathway.test / PathwayLocal!2026');
    console.log('Approved dashboard preview: student.approved@pathway.test / PathwayLocal!2026');
    console.log('Coordinator: coordinator.emulator@pathway.test / PathwayLocal!2026');
    console.log('Admin: admin.emulator@pathway.test / PathwayLocal!2026');
  }
  console.log('In a second PowerShell window, from PATHWAY-backend, use:');
  console.log('  npm run emulator:decision -- placement needs_revision');
  console.log('  npm run emulator:decision -- placement approved');
  console.log('  npm run emulator:decision -- final-review needs_revision');
  console.log('  npm run emulator:decision -- final-review approved');
  console.log('Keep this terminal open while developing. Press Ctrl+C here once when you want to stop the local services and emulators.');

  await new Promise(resolve => {
    web.once('exit', resolve);
    backend.once('exit', resolve);
    portal.once('exit', resolve);
  });
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
main().catch(error => {
  console.error(error.message || error);
  shutdown(1);
});
