const { createHash } = require('node:crypto');

const textLimits = {
  location: 300, supervisorName: 160, supervisorEmail: 254,
  supervisorPosition: 120, supervisorPhone: 60, internshipRole: 160,
};
const clean = value => typeof value === 'string' ? value.trim() : '';
const key = value => clean(value).toLowerCase();
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function normalizeMatchingSettings(input, { actorId, now } = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).some(field => !Object.hasOwn(textLimits, field)
      && !['eligibleCourses', 'acceptanceConfirmed'].includes(field))) invalid('Invalid company matching settings.');
  const { acceptanceConfirmed = false, eligibleCourses = [] } = input;
  if (typeof acceptanceConfirmed !== 'boolean' || !Array.isArray(eligibleCourses)
    || eligibleCourses.length > 30 || eligibleCourses.some(course => !key(course) || key(course).length > 120)) {
    invalid('Choose valid course codes and confirm company acceptance.');
  }
  const result = { acceptanceConfirmed, eligibleCourses: [...new Set(eligibleCourses.map(key))] };
  for (const [field, limit] of Object.entries(textLimits)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.trim().length > limit) invalid('Invalid matching field: ' + field);
    result[field] = value.trim();
  }
  if (result.supervisorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.supervisorEmail)) invalid('Enter a valid supervisor email.');
  if (acceptanceConfirmed && (!result.eligibleCourses.length || !result.location
    || !result.supervisorName || !result.supervisorEmail)) invalid('Confirmed slots require eligible courses, location, and supervisor contact.');
  if (acceptanceConfirmed && actorId && now != null) {
    result.acceptanceConfirmedBy = actorId;
    result.acceptanceConfirmedAt = now;
  }
  return result;
}

function companyReadiness(company, course) {
  const reasons = [];
  if (company.active !== true || company.status === 'inactive') reasons.push('Company is inactive.');
  if (!Number.isSafeInteger(company.capacity) || company.capacity < 1) reasons.push('Set an internship capacity.');
  if (!clean(company.name) || !clean(company.address)) reasons.push('Company name and address are required.');
  try {
    const { acceptanceConfirmedAt, acceptanceConfirmedBy, ...fields } = company.matching || {};
    const matching = normalizeMatchingSettings(fields);
    if (!matching.acceptanceConfirmed) reasons.push('Confirm company acceptance.');
    if (!matching.eligibleCourses.includes(key(course))) reasons.push('Company is ineligible for this course.');
  } catch {
    reasons.push('Company matching settings are incomplete.');
  }
  return reasons;
}

function studentSkipReason(student) {
  if (student.placementStatus === 'approved') return student.companyId
    ? 'Already has an approved placement.' : 'Approved placement requires manual repair.';
  if (student.companyId || student.placementProposalId || student.endorsementId) return 'Existing placement records require manual review.';
  if (student.role !== 'student' || student.accountApproved !== true
    || ['inactive', 'rejected', 'disabled'].includes(student.status) || student.clearanceStatus === 'cleared') return 'Student is ineligible.';
  return '';
}

function normalizePreferences(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype
    || Object.keys(input).some(field => !['companyIds', 'location'].includes(field))) invalid('Invalid placement preferences.');
  const { companyIds = [], location = '' } = input;
  if (!Array.isArray(companyIds) || companyIds.length > 3 || companyIds.some(id => !validId(id))
    || new Set(companyIds).size !== companyIds.length || typeof location !== 'string' || location.trim().length > 120) {
    invalid('Choose up to three distinct companies and enter a location of up to 120 characters.');
  }
  return { companyIds, location: location.trim() };
}

function suggestCompanyAssignments({ students, companies, course, proposals = [] }) {
  if (!key(course) || new Set(students.map(student => student.sectionId)).size > 1
    || students.some(student => key(student.course) !== key(course))) invalid('Choose students from one section and course.');
  for (const records of [students, companies]) {
    if (records.some(record => !validId(record.id)) || new Set(records.map(record => record.id)).size !== records.length) invalid('Duplicate or invalid matching identities.');
  }
  const slots = companies.filter(company => !companyReadiness(company, course).length)
    .map(company => ({ company, occupied: Math.max(0, Number(company.occupiedSlots) || 0) }));
  const skipped = [];
  const candidates = [...students].sort((a, b) => a.id.localeCompare(b.id)).flatMap(student => {
    const reason = studentSkipReason(student);
    if (reason) {
      skipped.push({ studentId: student.id, reason });
      return [];
    }
    const preferences = student.placementPreferences || {};
    const proposal = proposals.filter(item => item.studentId === student.id && item.status !== 'approved' && item.companyId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt), 'en', { numeric: true }) || a.id.localeCompare(b.id))[0];
    const ranked = Array.isArray(preferences.companyIds) ? preferences.companyIds : [];
    return [{ student, ranked: ranked.length || !proposal ? ranked : [proposal.companyId], location: key(preferences.location), choice: null }];
  });
  function assign(candidate, slot, reason) {
    if (!slot) return;
    slot.occupied++;
    candidate.choice = { companyId: slot.company.id, preferenceSummary: reason };
  }
  const available = slot => slot.occupied < slot.company.capacity;
  const balance = (a, b) => a.occupied / a.company.capacity - b.occupied / b.company.capacity
    || a.company.id.localeCompare(b.company.id);
  for (const candidate of candidates) {
    const preferred = candidate.ranked.map(id => slots.find(slot => slot.company.id === id && available(slot))).find(Boolean);
    assign(candidate, preferred, 'Preferred company');
  }
  for (const candidate of candidates.filter(row => !row.choice && row.location)) {
    const local = slots.filter(slot => available(slot) && key(slot.company.matching.location) === candidate.location).sort(balance);
    assign(candidate, local[0], 'Preferred location');
  }
  for (const candidate of candidates.filter(row => !row.choice)) {
    assign(candidate, slots.filter(available).sort(balance)[0], 'Available eligible slot');
  }
  return {
    rows: candidates.map(({ student, choice }) => ({
      studentId: student.id, studentName: student.name || student.idNumber || student.id,
      ...(choice || { companyId: null, reason: 'No eligible internship slots are available.' }),
    })),
    skipped,
  };
}

function fingerprint(record, fields) {
  return createHash('sha256').update(JSON.stringify(fields.map(field => record[field] ?? null),
    (_, value) => value && !Array.isArray(value) && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest('hex');
}
const studentMatchingFingerprint = student => fingerprint(student, [
  'id', 'name', 'idNumber', 'role', 'accountApproved', 'status', 'course', 'department', 'sectionId',
  'clearanceStatus', 'placementStatus', 'companyId', 'placementProposalId', 'endorsementId', 'placementPreferences',
]);
const companyMatchingFingerprint = company => fingerprint(company, [
  'id', 'name', 'address', 'industry', 'email', 'phone', 'active', 'status', 'capacity', 'matching',
]);
module.exports = { normalizeMatchingSettings, normalizePreferences, validId, companyReadiness, studentSkipReason,
  suggestCompanyAssignments, studentMatchingFingerprint, companyMatchingFingerprint };

function validateBatchSelection(plan, selection) {
  if (!Array.isArray(selection) || !selection.length || selection.length > 40) invalid('Choose 1 to 40 assignments.');
  const seen = new Set();
  return selection.map(row => {
    const { studentId, companyId } = row || {};
    if (!validId(studentId) || !validId(companyId) || !Object.hasOwn(plan.students, studentId)
      || !Object.hasOwn(plan.companies, companyId) || seen.has(studentId)) invalid('An assignment is duplicated or outside this preview.');
    seen.add(studentId);
    return { studentId, companyId };
  }).sort((a, b) => a.studentId.localeCompare(b.studentId));
}
module.exports.validateBatchSelection = validateBatchSelection;
