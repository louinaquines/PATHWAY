const crypto = require('crypto');

const AUTH_DOMAIN = 'students.pathway.invalid';
function accountIdentity(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{4,20}$/.test(id)) throw new Error('Invalid student ID.');
  const username = `uclm-${id.toLowerCase()}`;
  return { username, email: `${username}@${AUTH_DOMAIN}`, uid: `roster-${id.toLowerCase()}` };
}
function validReplacement(password, id, current) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128
    && password !== current && password !== `UC@${id}`
    && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

function installStudentAccounts({ app, auth, db, requireStaff, coordinatorSection, coordinatorOwnsStudent, allowRate, audit }) {
  async function identity(req) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Sign in again.'), { status: 401 });
    return auth.verifyIdToken(header.slice(7), true);
  }
  function failure(res, error) {
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Account operation could not be completed. Contact your coordinator.' });
  }
  async function releaseFailedOperation(ref, operation) {
    if (!ref || !operation) return;
    // Retain the access gate, but allow coordinator recovery after a partial failure.
    await db.runTransaction(async tx => {
      const fresh = await tx.get(ref);
      if (fresh.exists && fresh.data().passwordOperation === operation) tx.update(ref, { passwordOperation: null });
    }).catch(() => {});
  }
  app.post('/auth/profile', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = await identity(req);
      const snap = await db.collection('users').doc(token.uid).get();
      if (!snap.exists) return res.status(403).json({ error: 'Account profile unavailable.' });
      const profile = snap.data();
      if (profile.provisioningStatus === 'pending') return res.status(409).json({ error: 'Your account is still being provisioned. Contact your coordinator to retry the import.' });
      if (profile.passwordChangeRequired || (profile.passwordEpoch && token.passwordEpoch !== profile.passwordEpoch)) {
        return res.json({ profile: { role: profile.role, username: profile.username, passwordChangeRequired: true } });
      }
      return res.json({ profile });
    } catch (error) { return failure(res, error); }
  });

  app.post('/student/change-password', async (req, res) => {
    let ref;
    let operation;
    try {
      const token = await identity(req);
      if (!allowRate(req, res, { limit: 8, windowMs: 15 * 60_000, key: () => `password:${token.uid}` })) return;
      ref = db.collection('users').doc(token.uid);
      const snap = await ref.get();
      const profile = snap.data();
      const { currentPassword, newPassword, apiKey } = req.body || {};
      if (!profile || profile.role !== 'student' || !profile.username || profile.provisioningStatus !== 'ready') return res.status(403).json({ error: 'Completed student account provisioning is required.' });
      if (!validReplacement(newPassword, profile.idNumber, currentPassword) || typeof currentPassword !== 'string'
        || typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(apiKey)) {
        return res.status(400).json({ error: 'Choose a different password of 12–128 characters, including letters and numbers.' });
      }
      const base = process.env.FIREBASE_AUTH_EMULATOR_HOST
        ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com`
        : 'https://identitytoolkit.googleapis.com';
      const response = await fetch(`${base}/v1/accounts:signInWithPassword?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountIdentity(profile.idNumber).email, password: currentPassword, returnSecureToken: true }),
        signal: AbortSignal.timeout(15000),
      });
      const verified = await response.json();
      if (!response.ok || verified.localId !== token.uid) return res.status(403).json({ error: 'Current password is incorrect.' });
      operation = crypto.randomUUID();
      await db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        if (fresh.data().passwordOperation) throw Object.assign(new Error('Another password operation is in progress. Contact your coordinator if it persists.'), { status: 409 });
        if (fresh.data().passwordEpoch !== profile.passwordEpoch) throw Object.assign(new Error('Your account changed. Sign in again.'), { status: 409 });
        tx.update(ref, { passwordChangeRequired: true, passwordOperation: operation });
      });
      await auth.updateUser(token.uid, { password: newPassword });
      await auth.revokeRefreshTokens(token.uid);
      const epoch = crypto.randomUUID();
      const user = await auth.getUser(token.uid);
      await auth.setCustomUserClaims(token.uid, { ...user.customClaims, passwordEpoch: epoch });
      await db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        if (fresh.data().passwordOperation !== operation) throw new Error('Password operation changed.');
        tx.update(ref, { passwordChangeRequired: false, passwordOperation: null, passwordEpoch: epoch, passwordChangedAt: new Date().toISOString() });
        audit(tx, { actorId: token.uid, actorRole: 'student', action: 'student.password_changed', targetType: 'users', targetId: token.uid, details: {} });
      });
      return res.json({ success: true, signInAgain: true });
    } catch (error) {
      // Fail closed after an Auth mutation: never unlock an incomplete operation.
      await releaseFailedOperation(ref, operation);
      return failure(res, error);
    }
  });

  app.post('/coordinator/provision-students', requireStaff, async (req, res) => {
    if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: r => `provision:${r.staff.uid}` })) return;
    try {
      const { sectionId, students } = req.body || {};
      if (typeof sectionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(sectionId)
        || !Array.isArray(students) || students.length < 1 || students.length > 250) return res.status(400).json({ error: 'Select an assigned section and provide 1–250 students.' });
      const section = (await coordinatorSection(req, sectionId)).data();
      const seen = new Set();
      for (const student of students) {
        try { accountIdentity(student.idNumber); }
        catch { return res.status(400).json({ error: 'Each student needs a valid 4–20 character Student ID.' }); }
        if (typeof student.firstName !== 'string' || !student.firstName.trim() || student.firstName.length > 100
          || typeof student.lastName !== 'string' || !student.lastName.trim() || student.lastName.length > 100
          || seen.has(student.idNumber.toLowerCase())) return res.status(400).json({ error: 'Provide unique student IDs, first names, and last names.' });
        seen.add(student.idNumber.toLowerCase());
      }
      const outcomes = [];
      for (const student of students) {
        const account = accountIdentity(student.idNumber);
        try {
          const ref = db.collection('users').doc(account.uid);
          const roster = db.collection('studentRoster').doc(student.idNumber);
          const otherProfiles = await db.collection('users').where('idNumber', '==', student.idNumber).get();
          if (otherProfiles.docs.some(d => d.id !== account.uid)) throw new Error('Existing student account requires manual migration; no password was reset.');
          const epoch = crypto.randomUUID();
          let existing = false;
          await db.runTransaction(async tx => {
            const [user, row] = await Promise.all([tx.get(ref), tx.get(roster)]);
            if (user.exists) {
              if (user.data().sectionId !== sectionId || user.data().coordinatorId !== req.staff.uid || user.data().department !== req.staff.data.department) throw new Error('Account ownership conflict.');
              existing = user.data().provisioningStatus === 'ready';
              return;
            }
            if (row.exists && (row.data().claimedBy || row.data().department !== req.staff.data.department
              || (row.data().createdBy && row.data().createdBy !== req.staff.uid))) throw new Error('Roster ownership conflict.');
            tx.create(ref, { uid: account.uid, username: account.username, authEmail: account.email, email: '',
              idNumber: student.idNumber, firstName: student.firstName.trim(), lastName: student.lastName.trim(),
              role: 'student', department: req.staff.data.department, sectionId, coordinatorId: req.staff.uid,
              ...(section.termId ? { termId: section.termId, termName: section.termName || '' } : {}),
              accountApproved: true, status: 'active', requirementsStatus: 'not_submitted',
              passwordChangeRequired: true, passwordEpoch: epoch, provisioningStatus: 'pending',
              hoursRendered: 0, hoursRequired: section.hoursRequired || 486, company: '', createdAt: new Date().toISOString() });
            tx.set(roster, { idNumber: student.idNumber, department: req.staff.data.department, sectionId,
              active: true, claimedBy: account.uid, createdBy: req.staff.uid, createdAt: new Date().toISOString() }, { merge: true });
          });
          if (!existing) {
            let user;
            try { user = await auth.createUser({ uid: account.uid, email: account.email, password: `UC@${student.idNumber}` }); }
            catch (error) {
              if (error.code !== 'auth/uid-already-exists') throw error;
              user = await auth.getUser(account.uid);
              if (user.email !== account.email) throw new Error('Authentication ownership conflict.');
            }
            const profile = (await ref.get()).data();
            await auth.setCustomUserClaims(account.uid, { ...user.customClaims, passwordEpoch: profile.passwordEpoch });
            await db.runTransaction(async tx => {
              tx.update(ref, { provisioningStatus: 'ready' });
              audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'student.provisioned', targetType: 'users', targetId: account.uid, details: { sectionId, idNumber: student.idNumber } });
            });
          }
          outcomes.push({ idNumber: student.idNumber, username: account.username, status: existing ? 'unchanged' : 'created' });
        } catch (error) { outcomes.push({ idNumber: student.idNumber, status: 'failed', error: error.message }); }
      }
      return res.json({ outcomes });
    } catch (error) { return failure(res, error); }
  });

  app.post('/coordinator/students/:uid/reset-password', requireStaff, async (req, res) => {
    if (!allowRate(req, res, { limit: 10, windowMs: 60 * 60_000, key: r => `reset:${r.staff.uid}` })) return;
    let ref;
    let operation;
    try {
      ref = db.collection('users').doc(req.params.uid);
      const profile = (await ref.get()).data();
      if (!profile?.username || !await coordinatorOwnsStudent(req.staff.uid, profile)) return res.status(403).json({ error: 'Student is not in your assigned section.' });
      if (req.body.identityVerified !== true) return res.status(400).json({ error: 'Verify the student identity before resetting access.' });
      operation = crypto.randomUUID();
      await db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        if (fresh.data().passwordOperation) throw Object.assign(new Error('A password operation is already in progress.'), { status: 409 });
        tx.update(ref, { passwordChangeRequired: true, passwordOperation: operation });
      });
      const temporaryPassword = `PW!${crypto.randomBytes(18).toString('base64url')}7`;
      await auth.updateUser(ref.id, { password: temporaryPassword });
      await auth.revokeRefreshTokens(ref.id);
      const epoch = crypto.randomUUID();
      const user = await auth.getUser(ref.id);
      await auth.setCustomUserClaims(ref.id, { ...user.customClaims, passwordEpoch: epoch });
      await db.runTransaction(async tx => {
        tx.update(ref, { passwordEpoch: epoch, passwordOperation: null, passwordResetAt: new Date().toISOString() });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'student.password_reset', targetType: 'users', targetId: ref.id, details: { sectionId: profile.sectionId, identityVerified: true } });
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ temporaryPassword });
    } catch (error) { await releaseFailedOperation(ref, operation); return failure(res, error); }
  });
}
module.exports = { accountIdentity, validReplacement, installStudentAccounts };
