const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const failure = () => Object.assign(new Error('Verification is invalid or expired. Request a new code.'), { status: 403 });
function active(data, now = Date.now()) {
  if (!data || data.used || data.revoked || !(Date.parse(data.expiresAt) > now)) throw Object.assign(new Error('Evaluation link is expired or unavailable.'), { status: 410 });
}
function sessionValid(data, session, now = Date.now()) {
  active(data, now);
  if (typeof session !== 'string' || !/^[a-f0-9]{64}$/.test(session) || !data.verifiedSessionHash
    || !(Date.parse(data.verifiedSessionExpiresAt) > now) || hash(session) !== data.verifiedSessionHash) throw failure();
}
function installEvaluationOtp({ app, db, allowRate, mailerFactory }) {
  async function find(token) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw failure();
    const snap = await db.collection('evaluations').where('tokenHash', '==', hash(token)).limit(1).get();
    if (snap.empty) throw failure();
    active(snap.docs[0].data()); return snap.docs[0].ref;
  }
  for (const action of ['request-code', 'verify-code']) app.post(`/evaluation/:token/${action}`, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!allowRate(req, res, { limit: 10, windowMs: 600000, key: r => `evaluation-otp:${action}:${r.ip}` })) return;
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).some(key => action !== 'verify-code' || key !== 'code'))
        return res.status(400).json({ error: 'Invalid verification request.' });
      const ref = await find(req.params.token);
      if (action === 'request-code') {
        const code = String(crypto.randomInt(100000, 1000000)), salt = crypto.randomBytes(16).toString('hex');
        const mailer = mailerFactory();
        if (!mailer) return res.status(503).json({ error: 'Verification email is unavailable.' });
        try {
          const recipient = await db.runTransaction(async tx => {
            const data = (await tx.get(ref)).data(); active(data);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.supervisorEmail || '')) throw failure();
            if ((data.otpSendCount || 0) >= 5 || Date.now() - (Date.parse(data.otpRequestedAt) || 0) < 60000)
              throw Object.assign(new Error('Please wait before requesting another code. Maximum five codes per link.'), { status: 429 });
            tx.update(ref, { otpHash: hash(`${salt}:${code}`), otpSalt: salt, otpAttempts: 0,
              otpExpiresAt: new Date(Date.now() + 600000).toISOString(), otpRequestedAt: new Date().toISOString(),
              otpSendCount: (data.otpSendCount || 0) + 1, verifiedSessionHash: null, verifiedSessionExpiresAt: null });
            return data.supervisorEmail;
          });
          try {
            const result = await mailer.transport.sendMail({ from: mailer.from, to: recipient, subject: 'PATHWAY evaluation verification code',
              text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code.` });
            if (!result.accepted?.some(address => address.toLowerCase() === recipient.toLowerCase())) throw new Error('MAIL_UNCONFIRMED');
          } catch (error) {
            await db.runTransaction(async tx => {
              const data = (await tx.get(ref)).data();
              if (data?.otpHash === hash(`${salt}:${code}`)) tx.update(ref, { otpHash: null, otpSalt: null });
            });
            throw error;
          }
          return res.json({ success: true });
        } finally { mailer.transport.close(); }
      }
      const code = req.body?.code;
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw failure();
      const session = crypto.randomBytes(32).toString('hex');
      const valid = await db.runTransaction(async tx => {
        const data = (await tx.get(ref)).data(); active(data);
        if (!data.otpHash || !(Date.parse(data.otpExpiresAt) > Date.now()) || (data.otpAttempts || 0) >= 5) return false;
        if (hash(`${data.otpSalt}:${code}`) !== data.otpHash) { tx.update(ref, { otpAttempts: (data.otpAttempts || 0) + 1 }); return false; }
        tx.update(ref, { otpHash: null, otpSalt: null, verifiedSessionHash: hash(session),
          verifiedSessionExpiresAt: new Date(Date.now() + 1800000).toISOString() }); return true;
      });
      if (!valid) throw failure();
      return res.json({ session });
    } catch (error) { return res.status(error.status || 503).json({ error: error.status ? error.message : 'Verification email could not be confirmed. Wait before requesting another code.' }); }
  });
}
module.exports = { installEvaluationOtp, sessionValid, active, hash };
