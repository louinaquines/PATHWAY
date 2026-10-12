export async function adminRequest(path) {
  if (document.querySelector('#qa-failure')?.checked) throw new Error('Synthetic failure');
  if (path.endsWith('/ai-analysis')) return { completeness: [{ finding: 'Describe the testing outcome more clearly.', evidence: 'I tested the form and documented the result.' }], competencies: [{ name: 'Possible software testing evidence', evidence: 'tested the form' }], sentiment: [], limitation: 'Synthetic advisory result. No grades or approvals changed.' };
  if (path.endsWith('/attendance-ai')) return { today: '2026-10-12', explanations: [{ field: 'risk', value: 'Unavailable', explanation: 'Reliable history is insufficient. Confirm the work schedule before interpreting progress.' }, { field: 'attendanceRate', value: null, explanation: 'Missing reliable records do not establish absence.' }], limitation: 'Synthetic advisory explanation; estimates are not guarantees.' };
  return { findings: [{ finding: 'Inspect the supervisor field in the original document.', evidence: 'Supervisor: blank' }], limitation: 'Synthetic review only. Signatures and authenticity are not verified.' };
}
