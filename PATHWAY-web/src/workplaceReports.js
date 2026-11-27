// src/workplaceReports.js
import { adminRequest } from './adminApi';
// Latest unresolved workplace report per student (coordinator scope is enforced by the backend).
export async function fetchOpenWorkplaceReports() {
  const data = await adminRequest('/coordinator/workplace-support?limit=50');
  const open = new Map();
  for (const item of data?.records || []) {
    if (item.status === 'Resolved' || !item.studentId) continue;
    const current = open.get(item.studentId);
    if (!current || String(item.createdAt) > String(current.createdAt)) open.set(item.studentId, item);
  }
  return open;
}
