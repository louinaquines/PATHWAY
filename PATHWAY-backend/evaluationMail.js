const crypto = require('crypto');
const { validEmail, endorsementMailer } = require('./endorsementMail');
const { evaluationEmailHtml } = require('./evaluationEmailTemplate');

function installEvaluationMail({ app, db, requireStaff, coordinatorOwnsStudent, allowRate, writeAuditInTransaction }) {
  app.post('/coordinator/email-connection', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60_000, key: request => `email-check:${request.staff.uid}` })) return;
    if (process.env.MAIL_PROVIDER !== 'gmail') return res.status(503).json({ error: 'Gmail HTTPS delivery is not configured.' });
    const mailer = endorsementMailer();
    if (!mailer) return res.status(503).json({ error: 'Email service is not configured.' });
    try {
      await mailer.transport.verify();
      return res.json({ success: true, message: 'Gmail authorization verified. No email was sent.' });
    } catch (_) {
      return res.status(503).json({ error: 'Gmail authorization failed. Check the deployed OAuth credentials. No email was sent.' });
    } finally { mailer.transport.close(); }
  });
  app.post('/coordinator/evaluations/:evaluationId/email', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: request => `evaluation-email:${request.staff.uid}` })) return;
    const { token, message = '' } = req.body || {};
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(req.params.evaluationId) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)
      || typeof message !== 'string' || message.length > 2000) return res.status(400).json({ error: 'Invalid evaluation or message (maximum 2,000 characters).' });
    const mailer = endorsementMailer();
    let webUrl;
    try {
      webUrl = new URL(process.env.EVALUATION_WEB_URL);
      const local = process.env.PATHWAY_LOCAL_WORKFLOW === '1' && process.env.GOOGLE_CLOUD_PROJECT === 'demo-pathway-security'
        && ['localhost', '127.0.0.1'].includes(webUrl.hostname);
      if ((!local && webUrl.protocol !== 'https:') || !['http:', 'https:'].includes(webUrl.protocol)
        || webUrl.username || webUrl.password || webUrl.search || webUrl.hash || webUrl.pathname !== '/') throw new Error('Invalid URL');
    } catch (_) { return res.status(503).json({ error: 'Evaluation email requires a configured public EVALUATION_WEB_URL.' }); }
    if (!mailer) return res.status(503).json({ error: 'Email service is not configured.' });
    const ref = db.collection('evaluations').doc(req.params.evaluationId);
    try {
      const snapshot = await ref.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Evaluation not found.' });
      const evaluation = snapshot.data();
      const student = await db.collection('users').doc(evaluation.studentId).get();
      if (evaluation.createdBy !== req.staff.uid || !student.exists || !(await coordinatorOwnsStudent(req.staff.uid, student.data()))) {
        return res.status(403).json({ error: 'You can only email evaluations for your assigned students.' });
      }
      if (!validEmail(evaluation.supervisorEmail)) return res.status(400).json({ error: 'Confirm a valid supervisor email address.' });
      const alreadySent = await db.runTransaction(async transaction => {
        const freshStudent = await transaction.get(student.ref);
        if (freshStudent.data()?.clearanceStatus === 'cleared') throw Object.assign(new Error('Cleared OJT records are locked.'), { status: 409 });
        const fresh = (await transaction.get(ref)).data();
        if (!fresh || fresh.tokenHash !== crypto.createHash('sha256').update(token).digest('hex')) throw Object.assign(new Error('Invalid evaluation token.'), { status: 403 });
        if (fresh.emailStatus === 'sent') return true;
        if (fresh.used || new Date(fresh.expiresAt) <= new Date()) throw Object.assign(new Error('Evaluation is expired or already submitted.'), { status: 409 });
        if (fresh.emailStatus && fresh.emailStatus !== 'authorization_failed') throw Object.assign(new Error('This email has an attempt in progress or an uncertain delivery result. Check its status before sending another invitation.'), { status: 409 });
        transaction.update(ref, { emailStatus: 'sending', emailAttemptedAt: new Date().toISOString() });
        return false;
      });
      if (alreadySent) return res.json({ success: true, emailStatus: 'sent', alreadySent: true });
      let accepted = false;
      let authorizationFailed = false;
      try {
        const result = await mailer.transport.sendMail({
          from: mailer.from, to: evaluation.supervisorEmail,
          messageId: `<evaluation-${ref.id}@pathway.invalid>`, subject: 'PATHWAY supervisor evaluation request',
          html: evaluationEmailHtml(evaluation, message, `${webUrl.origin}/evaluate?token=${token}`),
          text: `Dear ${evaluation.supervisorName},\n\nPlease complete the internship evaluation for ${evaluation.studentName} at ${evaluation.companyName}.\n\n${message.trim() ? `${message.trim()}\n\n` : ''}Secure evaluation link:\n${webUrl.origin}/evaluate?token=${token}\n\nThis link expires on ${evaluation.expiresAt} and can be submitted once. Please do not forward it.\n\nPATHWAY OJT coordinator`,
        });
        accepted = Array.isArray(result.accepted) && result.accepted.some(address => address.toLowerCase() === evaluation.supervisorEmail.toLowerCase());
      } catch (error) {
        authorizationFailed = process.env.MAIL_PROVIDER === 'gmail' && error.code === 'GMAIL_AUTH';
        console.error('Evaluation email error:', error.code || 'unknown');
      }
      const emailStatus = accepted ? 'sent' : authorizationFailed ? 'authorization_failed' : 'delivery_unknown';
      await db.runTransaction(async transaction => {
        await transaction.get(ref);
        transaction.update(ref, { emailStatus, ...(accepted ? { emailAcceptedAt: new Date().toISOString() } : {}) });
        writeAuditInTransaction(transaction, { actorId: req.staff.uid, actorRole: 'coordinator', action: accepted ? 'evaluation.email_accepted' : authorizationFailed ? 'evaluation.email_authorization_failed' : 'evaluation.email_unknown', targetType: 'evaluations', targetId: ref.id, details: { studentId: evaluation.studentId } });
      });
      return res.status(accepted ? 200 : 502).json({ success: accepted, emailStatus, ...(accepted ? {} : { error: authorizationFailed ? 'Gmail authorization failed before sending. Correct the credentials, check the connection, then manually retry this invitation.' : 'Email delivery could not be confirmed. Do not automatically resend; check the mail service first.' }) });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      console.error('Evaluation email processing failed:', error.code || 'unknown');
      return res.status(500).json({ error: 'Could not confirm evaluation email status. Refresh the records before trying again.' });
    }
  });
}

module.exports = { installEvaluationMail };
