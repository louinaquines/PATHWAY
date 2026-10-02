const nodemailer = require('nodemailer');

// Deliberately accept one plain mailbox only. Nodemailer also accepts address
// lists/display-name syntax, which must never be smuggled in via company data.
const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

function endorsementMailer(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const port = Number(env.SMTP_PORT || 0);
  const from = String(env.SMTP_FROM || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  const password = String(env.SMTP_PASSWORD || '');
  const localTest = env.PATHWAY_LOCAL_WORKFLOW === '1'
    && env.GOOGLE_CLOUD_PROJECT === 'demo-pathway-security'
    && ['127.0.0.1', 'localhost'].includes(host);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !validEmail(from)
    || (!localTest && (!user || !password)) || Boolean(user) !== Boolean(password)) return null;
  const secure = port === 465;
  return {
    from,
    transport: nodemailer.createTransport({
      host, port, secure,
      ...(user ? { auth: { user, pass: password } } : {}),
      requireTLS: !secure && !localTest,
      ignoreTLS: localTest,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    }),
  };
}

async function sendEndorsement({ mailer, to, studentName, companyName, fileName, bytes, messageId }) {
  const info = await mailer.transport.sendMail({
    from: mailer.from,
    to,
    messageId,
    subject: 'PATHWAY signed endorsement copy',
    text: `The signed endorsement copy for ${studentName}'s approved placement at ${companyName} is attached. Please contact the OJT coordinator if the placement details need correction.`,
    attachments: [{
      filename: fileName,
      content: bytes,
      contentType: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
    }],
  });
  if (!Array.isArray(info.accepted) || !info.accepted.some(address => address.toLowerCase() === to.toLowerCase())) {
    throw new Error('The mail server did not accept the recipient.');
  }
  return info.messageId || messageId;
}

module.exports = { validEmail, endorsementMailer, sendEndorsement };
