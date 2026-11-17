// Deterministic student-name comparison for document checks. Never uses AI.
// Returns 'match' | 'partial' | 'mismatch' | 'missing'.
const NICK = { ma: 'maria', jr: '', sr: '', ii: '', iii: '', iv: '', mr: '', ms: '', mrs: '', miss: '' };
function tokens(value) {
  if (typeof value !== 'string') return [];
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ñ/g, 'n').replace(/[^a-z\s,.-]/g, ' ').replace(/[,.-]/g, ' ')
    .split(/\s+/).filter(Boolean).map(t => Object.hasOwn(NICK, t) ? NICK[t] : t).filter(Boolean);
}
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
}
// Each name part (first names may have several words) must appear; middle name is optional but must not conflict.
function compareStudentName({ firstName, middleName, lastName }, documentName) {
  const doc = tokens(documentName);
  if (!doc.length) return { result: 'missing', detail: 'No name could be read from the document.' };
  const first = tokens(firstName), last = tokens(lastName), middle = tokens(middleName);
  if (!first.length || !last.length) return { result: 'missing', detail: 'Student profile name is incomplete.' };
  let near = false;
  const has = part => { if (doc.includes(part)) return true; if (part.length >= 4 && doc.some(d => distance(d, part) <= 1)) { near = true; return true; } return false; };
  const firstOk = first.every(has), lastOk = last.every(has);
  if (!firstOk || !lastOk) return { result: (firstOk || lastOk) ? 'partial' : 'mismatch', detail: `Document name "${documentName}" does not match the student profile.` };
  if (middle.length) {
    const initials = doc.filter(d => d.length === 1);
    const middleOk = middle.every(m => doc.includes(m) || initials.includes(m[0]));
    const extra = doc.filter(d => ![...first, ...last, ...middle].includes(d) && !(d.length === 1 && middle.some(m => m[0] === d)));
    if (!middleOk && extra.length) return { result: 'partial', detail: 'Middle name or initial on the document differs from the profile.' };
  }
  return near ? { result: 'partial', detail: 'Name is very similar but not exact; please confirm spelling.' } : { result: 'match', detail: 'Student name matches the document.' };
}
module.exports = { compareStudentName, tokens };
