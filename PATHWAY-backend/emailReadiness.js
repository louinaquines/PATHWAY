// Configuration-only check: never sends mail, connects to SMTP, or prints secrets.
function checkEmailReadiness(env) {
  const errors = [];
  const provider = String(env.MAIL_PROVIDER || 'smtp').trim();
  if (!['smtp', 'gmail'].includes(provider)) errors.push('MAIL_PROVIDER must be smtp or gmail.');
  if (provider === 'gmail') errors.push(...require('./gmailMail').gmailConfigErrors(env));
  for (const key of provider === 'smtp' ? ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD'] : []) {
    if (!String(env[key] || '').trim()) errors.push(`Configure ${key}.`);
  }
  const port = Number(env.SMTP_PORT);
  if (provider === 'smtp' && env.SMTP_PORT && (!Number.isInteger(port) || port < 1 || port > 65535)) errors.push('SMTP_PORT must be a valid TCP port.');
  const { validEmail } = require('./endorsementMail');
  if (provider === 'smtp' && env.SMTP_FROM && !validEmail(env.SMTP_FROM)) errors.push('SMTP_FROM must be one valid mailbox.');
  const host = String(env.SMTP_HOST || '').trim().toLowerCase();
  if (provider === 'smtp' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) errors.push('Real delivery requires a non-loopback SMTP server.');
  try {
    const url = new URL(env.EVALUATION_WEB_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')
      || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new Error('Invalid origin');
  } catch (_) { errors.push('Configure EVALUATION_WEB_URL as a public HTTPS origin without a path, query, fragment or credentials.'); }
  return errors;
}

if (require.main === module) {
  if (process.env.NODE_ENV !== 'production') require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
  const errors = checkEmailReadiness(process.env);
  errors.forEach(message => console.log(`MISSING/INVALID: ${message}`));
  console.log(errors.length ? 'Real email configuration is not ready; no email sent.' : 'Configuration shape passed. SMTP authentication, public reachability and approved-recipient inbox delivery still need verification; no email sent.');
  process.exitCode = errors.length ? 1 : 0;
}
module.exports = { checkEmailReadiness };
