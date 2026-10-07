export function requirementProgress(requirements = {}, checklist = []) {
  const ids = [...new Set(checklist.map(item => item.id).filter(Boolean))];
  const total = ids.length;
  const approved = ids.filter(id => requirements?.[id]?.status === 'approved').length;
  return { approved, total, percentage: total ? Math.round(approved / total * 100) : 0 };
}
