// Read-only local release preparation. Never edits configuration, deploys or enables processing.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const gates = ['updatedClientAvailable', 'nativeReleaseVerified', 'updateNoticeReady', 'installedInventoryReviewed',
  'staffApiVerified', 'rollbackVerified', 'ownerApproved'];
function assessJournalClientContract(evidence = {}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) evidence = {};
  const validBuild = value => Number.isSafeInteger(value) && value > 0;
  const missing = gates.filter(key => !Object.hasOwn(evidence, key) || evidence[key] !== true);
  if (!Object.hasOwn(evidence, 'candidateBuild') || !validBuild(evidence.candidateBuild)) missing.push('candidateBuild');
  const contractAllowed = missing.length === 0;
  return { contractAllowed, blockOlderSubmissions: contractAllowed, minimumBuild: validBuild(evidence.candidateBuild) ? evidence.candidateBuild : null,
    updateRequired: contractAllowed && (!validBuild(evidence.installedBuild) || evidence.installedBuild < evidence.candidateBuild), missing,
    changesApplied: false };
}
function buildWorkplaceReleaseManifest({ root, now = new Date() } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Explicit release root/time required.');
  const read = relative => fs.readFileSync(path.join(root, relative));
  const app = JSON.parse(read('PATHWAY-master/app.json')), candidate = JSON.parse(read('release-candidates/workplace-journal-client.json'));
  if (!Number.isSafeInteger(app.expo?.android?.versionCode) || candidate.schema !== 'workplace-client-candidate-v1'
    || !Number.isSafeInteger(candidate.androidVersionCode) || candidate.androidVersionCode <= app.expo.android.versionCode
    || candidate.minimumBuildAfterApprovedContract !== candidate.androidVersionCode || candidate.journalBackendSubmission !== '1'
    || candidate.env?.EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION !== '1'
    || candidate.enforceMinimumVersionNow !== false || candidate.updatedClientAvailable !== false) throw Error('Release candidate unavailable.');
  const names = ['PATHWAY-master/app.json', 'PATHWAY-master/screens/LogbookScreen.js', 'PATHWAY-master/services/journalSubmission.js',
    'PATHWAY-backend/studentJournalSubmission.js', 'PATHWAY-backend/workplaceHostedService.js', 'PATHWAY-backend/workplaceHostedControl.js',
    'PATHWAY-backend/workplaceReadinessGate.js', 'PATHWAY-backend/workplaceHostedRuntime.js', 'PATHWAY-backend/workplaceWakeAuthority.js',
    'firestore.rules', 'firebase.json', 'release-candidates/workplace-backend-journals.rules',
    'release-candidates/workplace-journal-client.json', 'release-candidates/workplace-journal-backend.firebase.json'];
  names.push('PATHWAY-backend/workplaceReleasePackage.js', 'PATHWAY-backend/workplaceHostedWake.js', 'PATHWAY-backend/workplaceJournalWorker.js',
    'PATHWAY-backend/workplaceGeneralProvider.js', 'PATHWAY-backend/workplaceAnalysisPricing.js', 'PATHWAY-backend/workplaceAnalysisBudget.js',
    'PATHWAY-backend/workplaceRealUsePolicy.js', 'PATHWAY-backend/workplaceClaudeAdapter.js', 'PATHWAY-backend/workplaceConcernDetector.js',
    'PATHWAY-backend/workplaceConcernCases.js', 'PATHWAY-backend/server.js');
  const firebase = JSON.parse(read('firebase.json')), separate = JSON.parse(read('release-candidates/workplace-journal-backend.firebase.json'));
  if (firebase.firestore?.rules !== 'firestore.rules' || separate.firestore?.rules !== 'workplace-backend-journals.rules') throw Error('Rules release selection changed.');
  return { schema: 'workplace-release-manifest-v1', capturedAt: now.toISOString(), sourceRevision: 'sha256-content-manifest',
    currentAndroidBuild: app.expo.android.versionCode, candidateAndroidBuild: candidate.androidVersionCode,
    candidateJournalBackendSubmission: candidate.journalBackendSubmission, processingEnabled: false, readyForDeployment: false,
    blockers: ['installed-client-not-verified', 'hosted-installation-not-verified', 'production-cutover-not-authorized'],
    files: names.map(name => ({ path: name, sha256: createHash('sha256').update(read(name)).digest('hex') })) };
}
function verifyWorkplaceReleaseManifest({ root, manifest } = {}) {
  try {
    const fresh = buildWorkplaceReleaseManifest({ root });
    const matches = manifest?.schema === fresh.schema && manifest.sourceRevision === fresh.sourceRevision
      && manifest.processingEnabled === false && manifest.readyForDeployment === false
      && manifest.currentAndroidBuild === fresh.currentAndroidBuild && manifest.candidateAndroidBuild === fresh.candidateAndroidBuild
      && manifest.candidateJournalBackendSubmission === fresh.candidateJournalBackendSubmission
      && isDeepStrictEqual(manifest.blockers, fresh.blockers) && isDeepStrictEqual(manifest.files, fresh.files);
    return { matches, readyForDeployment: false, processingEnabled: false };
  } catch { return { matches: false, readyForDeployment: false, processingEnabled: false }; }
}
module.exports = { buildWorkplaceReleaseManifest, verifyWorkplaceReleaseManifest, assessJournalClientContract };
