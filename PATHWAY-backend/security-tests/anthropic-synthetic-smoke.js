// Explicitly invoked paid smoke test: synthetic inputs only, no database access.
const { createAnthropicAnalysis } = require('../anthropicAnalysis');
async function main() {
  const documentOnly = process.argv.includes('--document-only');
  const requestLimit = documentOnly ? 1 : 3;
  const priorReservedUsd = documentOnly ? 0.05248 : 0.01312;
  const key = process.env.PATHWAY_SMOKE_API_KEY;
  if (!key) throw new Error('Hidden API-key input is required.');
  let requests = 0, inputTokens = 0, outputTokens = 0, reservedUsd = 0;
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    // Conservative reservation at the higher published Haiku rate, using a
    // byte-sized input bound plus headroom and the adapter's output-token cap.
    const reservation = (16000 * 0.50 + 2048 * 2.50) / 1000000;
    if (url !== 'https://api.anthropic.com/v1/messages' || body.model !== 'claude-haiku-5-5'
      || body.max_tokens !== 2048 || requests >= requestLimit || Buffer.byteLength(JSON.stringify(body)) > 12000
      || priorReservedUsd + reservedUsd + reservation > 0.10) throw new Error('Smoke-test bounds exceeded.');
    requests++; reservedUsd += reservation;
    const response = await fetch(url, options);
    if (response.ok) {
      const result = await response.clone().json();
      inputTokens += Number(result.usage?.input_tokens || 0);
      outputTokens += Number(result.usage?.output_tokens || 0);
    }
    return response;
  };
  const ai = createAnthropicAnalysis({ ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: key,
    ANTHROPIC_MODEL: 'claude-haiku-5-5', ANTHROPIC_DAILY_REQUEST_LIMIT: '4' }, fetcher);
  const notes = 'TEST ONLY. On Monday I tested the sample login form and documented two validation errors. I felt pleased after completing the checks. I did not deploy changes.';
  const checks = [
    ['refinement', () => ai.refine(notes)],
    ['journal', () => ai.analyzeJournal(notes)],
    ['attendance', () => ai.explainAttendance({ creditedHours: 80, completionPercentage: 20, attendanceRate: 90,
      onTimeRate: 85, missedShifts: 1, projectedCompletion: null, risk: 'On Track' })],
    ['document', () => ai.assistDocument('TEST ONLY DTR transcription. Day 6: AM arrival 08:00, departure 12:00. PM arrival is unreadable. Comparison issue: incomplete transcription; manual review required.')],
  ];
  let passed = 0;
  // One request was already used in the initial attempt. Preserve the owner's
  // four-request authorization across that attempt and this corrected retry.
  for (const [feature, run] of (documentOnly ? checks.slice(3) : checks.slice(0, 3))) {
    try { const result = await run(); passed++; console.log(JSON.stringify({ feature, passed: true, result })); }
    catch (error) { console.log(JSON.stringify({ feature, passed: false, code: error.code || 'SMOKE_FAILED' })); break; }
  }
  console.log(JSON.stringify({ passed, planned: requestLimit, documentDeferred: !documentOnly, requests, inputTokens, outputTokens, conservativeReservedUsd: reservedUsd,
    cumulativeConservativeReservedUsd: priorReservedUsd + reservedUsd,
    syntheticOnly: true, databaseWrites: 0, productionEnabled: false }));
  if (passed !== requestLimit) process.exitCode = 1;
}
main().catch(() => { console.error('Synthetic smoke test could not complete. No credentials are printed.'); process.exitCode = 1; });
