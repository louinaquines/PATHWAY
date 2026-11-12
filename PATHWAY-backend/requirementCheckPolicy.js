const BASE = ['readability', 'document_type', 'student_identity', 'required_fields', 'date_consistency'];
const fail = (code, status = 503) => Object.assign(new Error('Document review is unavailable.'), { code, status });
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
// Exact aliases only; a custom label containing a built-in name is not a policy.
const BUILT_INS = [
  [['cor'], ['Certificate of Registration'], true, true, ['student name', 'student id', 'issuing institution', 'academic term', 'registered courses']],
  [['endorsement', 'endorsement_letter'], ['Recommendation/Endorsement', 'Endorsement Letter'], false, true, ['student name', 'issuing institution', 'recipient organization', 'internship endorsement', 'issue date']],
  [['parental_consent'], ['Notarized Parental Consent & Waiver'], false, true, ['student name', 'parent or guardian name', 'consent and waiver statement', 'consent date', 'visible notarial section']],
  [['medical_cert', 'medical_certificate'], ['Medical Certificate'], false, true, ['student name', 'issue date', 'issuer name', 'visible medical certificate statement']],
  [['good_moral'], ['Certificate of Good Moral Character', 'Good Moral Certificate', 'Good Moral'], false, true, ['student name', 'issuing institution', 'issue date', 'visible good moral statement']],
  [['moa', 'signed_moa'], ['MOA & Internship Plan', 'Signed MOA'], false, true, ['student name', 'school name', 'host organization', 'internship period', 'internship plan', 'agreement parties']],
  [['dtr'], ['Daily Time Record', 'DTR'], true, false, ['student name', 'student id', 'reporting period', 'dated attendance records', 'time entries']],
  [['logbook'], ['Logbook'], false, false, ['student name', 'reporting period', 'dated activity entries']],
  [['coc'], ['Certificate of Completion'], false, true, ['student name', 'host organization', 'internship period', 'completion date', 'visible completion statement']],
  [['eval_sheet'], ['Performance Evaluation'], false, true, ['student name', 'host organization', 'evaluation period', 'evaluation ratings', 'evaluator name']],
  [['narrative'], ['Narrative Report'], false, false, ['student name', 'host organization', 'internship period', 'internship activities', 'learning reflection']],
  [['application_form'], ['Application Form'], true, false, ['student name', 'student id', 'program', 'contact information', 'application date']],
  [['updated_resume'], ['Updated Resume'], false, false, ['student name', 'contact information', 'education', 'skills or experience']],
].map(([ids, labels, requiresStudentId, signature, requiredFields]) => ({ ids, labels, requiresStudentId, signature, requiredFields }));
function resolveRequirementPolicy(definition = {}) {
  const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') : '';
  const builtIn = BUILT_INS.find(policy => policy.ids.some(id => normalize(id) === normalize(definition.id)))
    || BUILT_INS.find(policy => policy.labels.some(label => normalize(label) === normalize(definition.label)));
  const policy = definition.checkPolicy;
  const customExplicit = !!policy && Array.isArray(policy.requiredChecks) && policy.requiredChecks.length > 0 && policy.requiredChecks.length <= 20 && policy.requiredChecks.every(key => text(key, 64) && /^[a-z][a-z0-9_]*$/.test(key));
  const requiredChecks = [...BASE];
  const description = [definition.type, definition.key, definition.id, definition.name, definition.title, definition.label].map(normalize).join(' ');
  if (builtIn?.signature || /medical|certificate|endorsement|\bmoa\b|consent/i.test(description)) requiredChecks.push('signature_presence');
  if (builtIn?.ids.some(id => ['endorsement', 'endorsement_letter', 'moa', 'signed_moa', 'coc', 'eval_sheet', 'dtr', 'logbook', 'narrative'].includes(id)) || /endorsement|\bmoa\b|completion|performance evaluation|daily time record|logbook|narrative/i.test(description) || (customExplicit && policy.requiresPlacement === true)) requiredChecks.push('placement_match');
  if (customExplicit) for (const key of policy.requiredChecks) if (!requiredChecks.includes(key)) requiredChecks.push(key);
  const fields = customExplicit ? (policy.requiredFields || definition.requiredFields || []) : (definition.requiredFields || []);
  const validFields = Array.isArray(fields) && fields.length <= 30 && fields.every(field => text(field, 200));
  const requiredFields = [...new Set([...(builtIn?.requiredFields || []), ...(validFields ? fields : [])])];
  return { requiredChecks, requiredFields, requiresStudentId: !!builtIn?.requiresStudentId || (customExplicit && policy.requiresStudentId === true) || requiredFields.some(field => /student[ _-]*(id|number)|id[ _-]*number/i.test(field)), explicit: (!!builtIn || customExplicit) && validFields };
}
function sniff(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw fail('AI_INPUT', 400);
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (b.length >= 4 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(b.subarray(0, 8).toString('ascii'))) return 'application/pdf';
  throw fail('AI_INPUT', 400);
}
function validate(result, policy) {
  if (!exact(result, ['checks', 'confidence', 'findings']) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1 || !Array.isArray(result.checks) || result.checks.length !== policy.requiredChecks.length || !Array.isArray(result.findings) || result.findings.length > 10 || !result.findings.every(v => text(v, 500))) throw fail('AI_OUTPUT');
  const seen = new Set();
  for (const check of result.checks) {
    if (!exact(check, ['key', 'passed', 'evidence']) || !policy.requiredChecks.includes(check.key) || seen.has(check.key) || typeof check.passed !== 'boolean' || !text(check.evidence, 500)) throw fail('AI_OUTPUT');
    seen.add(check.key);
    // A positive flag cannot override explicit uncertainty in its evidence.
    if (/\b(uncertain|unclear|unreadable|illegible|unknown|cannot|unable|not visible|not sure|may be|might)\b/i.test(check.evidence)) check.passed = false;
  }
  return result;
}

// Coordinator auto-check settings extend the checklist with reference/phrase comparisons.
function withAutoCheck(policy, definition = {}) {
  const a = definition.autoCheck;
  if (!a || a.enabled !== true) return policy;
  const requiredChecks = [...policy.requiredChecks];
  if (a.referenceVersion && !requiredChecks.includes('reference_match')) requiredChecks.push('reference_match');
  if (Array.isArray(a.requiredPhrases) && a.requiredPhrases.length && !requiredChecks.includes('required_phrases')) requiredChecks.push('required_phrases');
  return { ...policy, requiredChecks, explicit: true };
}
module.exports = { withAutoCheck, resolveRequirementPolicy, sniff, validate };
