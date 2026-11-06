// Presentation only: keep every underlying task and decision independent.
export function placementStudentQueue({ placements = [], finals = [], endorsements = [], verified = [], history = [], nameFor = item => item.studentName || item.studentId }) {
  const groups = new Map();
  const add = (record, stage, step, action, priority, needsAction) => {
    if (!record.studentId) return;
    if (!groups.has(record.studentId)) groups.set(record.studentId, { id: record.studentId, name: nameFor(record), tasks: [] });
    const group = groups.get(record.studentId);
    group.tasks.push({ record, stage, step, action, priority, needsAction });
  };
  placements.forEach(item => add(item, 'placement', item.status === 'pending_review' ? 'Placement awaiting review' : item.status === 'needs_revision' ? 'Student revising placement' : 'Placement ' + (item.status || 'recorded').replace(/_/g, ' '), item.status === 'pending_review' ? 'Review placement' : 'View placement', item.status === 'pending_review' ? 1 : 9, ['pending_review','needs_revision'].includes(item.status)));
  finals.forEach(item => add(item, 'final', item.status === 'pending_review' ? 'OJT access awaiting review' : item.status === 'needs_revision' ? 'Student revising submission' : 'OJT access ' + (item.status || 'recorded').replace(/_/g, ' '), item.status === 'pending_review' ? 'Review OJT access' : 'View decision', item.status === 'pending_review' ? 2 : 9, ['pending_review','needs_revision'].includes(item.status)));
  endorsements.forEach(item => add(item, 'endorsement', item.draftVersion > 0 ? 'Awaiting signed letter' : 'Endorsement draft needed', 'View endorsement', 3, true));
  verified.forEach(item => add(item, 'verified', item.deliveryStatus === 'sent' ? 'Signed letter sent' : item.deliveryStatus === 'sending' ? 'Email reconciliation needed' : 'Signed letter verified', item.deliveryStatus === 'sent' ? 'View delivery' : 'View signed letter', 4, item.deliveryStatus !== 'sent'));
  history.forEach(item => add(item, 'history', 'Placement history', 'View history', 10, false));
  return [...groups.values()].map(group => {
    group.tasks.sort((a,b) => a.priority - b.priority || String(b.record.updatedAt || b.record.createdAt || '').localeCompare(String(a.record.updatedAt || a.record.createdAt || '')));
    const current = group.tasks.find(task => task.needsAction) || group.tasks.find(task => task.stage !== 'history') || group.tasks[0];
    return { ...group, current, needsAction: group.tasks.some(task => task.needsAction), hasHistory: group.tasks.some(task => task.stage === 'history'), company: current.record.companyName || current.record.companySnapshot?.companyName || current.record.after?.companyName || '—' };
  }).sort((a,b) => Number(b.needsAction) - Number(a.needsAction) || a.name.localeCompare(b.name));
}
