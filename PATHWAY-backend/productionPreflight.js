// Read-only validation: no Firebase initialization, network requests, or secret output.
const fs = require('node:fs');
const path = require('node:path');

function validateProduction(env) {
  const errors = [];
  const warnings = [];
  if (env.NODE_ENV !== 'production') errors.push('Set NODE_ENV=production.');
  for (const key of ['PATHWAY_LOCAL_WORKFLOW', 'PATHWAY_CLOUDINARY_QA', 'PATHWAY_CLOUDINARY_QA_CONFIRMED', 'PATHWAY_EMULATOR_RESTORED', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'CLOUDINARY_API_BASE_URL']) {
    if (env[key]) errors.push(`Remove ${key} from production configuration.`);
  }
  if (!env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT.startsWith('demo-')) errors.push('Set GOOGLE_CLOUD_PROJECT to the real deployment project.');
  const origins = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length) errors.push('Explicit CORS_ALLOWED_ORIGINS is required.');
  if (origins.some(origin => {
    try {
      const url = new URL(origin);
      return url.protocol !== 'https:' || url.origin !== origin || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || Boolean(url.username || url.password);
    } catch { return true; }
  })) errors.push('CORS origins must be exact HTTPS origins without credentials, paths, or loopback hosts.');
  const provider = String(env.MAIL_PROVIDER || 'smtp').trim();
  if (!['smtp', 'gmail'].includes(provider)) errors.push('MAIL_PROVIDER must be smtp or gmail.');
  if (provider === 'gmail') errors.push(...require('./gmailMail').gmailConfigErrors(env));
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', ...(provider === 'smtp' ? ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'] : [])]) {
    if (!String(env[key] || '').trim()) errors.push(`Configure ${key}.`);
  }
  const port = Number(env.SMTP_PORT);
  if (provider === 'smtp' && env.SMTP_PORT && (!Number.isInteger(port) || port < 1 || port > 65535)) errors.push('SMTP_PORT must be a valid TCP port.');
  if (provider === 'smtp' && ['localhost', '127.0.0.1', '::1'].includes(env.SMTP_HOST)) errors.push('SMTP_HOST must not be a local test server.');
  try {
    const url = new URL(env.EVALUATION_WEB_URL);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/'
      || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || /^[\d.]+$/.test(host) || host.includes(':')) throw new Error('Invalid URL');
  } catch (_) { errors.push('Configure EVALUATION_WEB_URL as a public HTTPS site origin without credentials, paths, query or fragment.'); }
  if (!env.ANTHROPIC_API_KEY) warnings.push('AI refinement will be unavailable without ANTHROPIC_API_KEY.');
  warnings.push('Verify attached service identity/ADC permissions, staging delivery, backups, and rollback separately.');
  return { errors, warnings };
}

function validatePackaging(directory = __dirname) {
  const dockerfile = fs.readFileSync(path.join(directory, 'Dockerfile'), 'utf8');
  const source = fs.readFileSync(path.join(directory, 'server.js'), 'utf8');
  const dependencies = [...new Set(['server.js', ...Array.from(source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g), match => `${match[1]}.js`)])];
  const copied = dockerfile.split(/\r?\n/).filter(line => /^COPY\s/i.test(line)).join(' ');
  return dependencies.filter(file => !copied.split(/\s+/).includes(file)).map(file => `Dockerfile must include ${file}.`);
}

function assertProductionStartup(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const result = validateProduction(env);
  if (result.errors.length) throw new Error(`Production startup blocked:\n${result.errors.join('\n')}`);
  result.warnings.forEach(message => console.warn(`WARN: ${message}`));
}

if (require.main === module) {
  // Use only explicit deployment environment variables; never read local .env.
  const result = validateProduction(process.env);
  result.errors.push(...validatePackaging());
  result.errors.forEach(message => console.log(`FAIL: ${message}`));
  result.warnings.forEach(message => console.log(`WARN: ${message}`));
  console.log(result.errors.length ? `Production preflight failed: ${result.errors.length} issue(s).` : 'Configuration preflight passed; external verification is still required.');
  process.exitCode = result.errors.length ? 1 : 0;
}
module.exports = { validateProduction, validatePackaging, assertProductionStartup };
