const indexedNotice = data => ({ ...data, ...require('./coordinatorInbox').inboxFields(data) });
async function notifyStudentUpdate(tx, db, { department, sectionId, senderId, title, message, type, createdAt = new Date().toISOString() }) {
  let recipients = db.collection('users').where('role', '==', 'student').where('department', '==', department);
  if (sectionId) recipients = recipients.where('sectionId', '==', sectionId);
  // Read recipients before any transaction writes so the setting and notices commit together.
  const students = await tx.get(recipients);
  for (const student of students.docs) tx.create(db.collection('notifications').doc(), indexedNotice({
    recipientId: student.id, senderId, senderRole: 'coordinator', title, message, type,
    read: false, createdAt, ...(sectionId ? { sectionId } : {}),
  }));
}
module.exports = { notifyStudentUpdate };
