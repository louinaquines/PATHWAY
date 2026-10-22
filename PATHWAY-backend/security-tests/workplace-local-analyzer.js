// Exact synthetic fixtures only: no classification, provider, key or network access.
const { fixtures } = require('./workplace-claude-fixtures');
const { validateConcernDecision } = require('../workplaceConcernDetector');
const { FEATURES } = require('../workplaceAnalysisPricing');
function createLocalAnalyzer() {
  function fixture(notes) {
    const found = fixtures.find(f => f.notes === notes);
    if (!found) throw Error('Synthetic analysis unavailable.');
    return found;
  }
  return {
    prepare(notes) {
      fixture(notes);
      return { model: 'claude-haiku-5-5', inputTokenUpperBound: 10000, maxOutputTokens: 1024, features: FEATURES, request: notes };
    },
    async analyze(prepared) {
      const f = fixture(prepared?.request);
      const decision = validateConcernDecision(f.notes, { version: 'workplace-concern-v1', findings: f.expected === 'none' ? [] : [{
        category: f.expected === 'high' ? 'threat' : f.id === 'en-coercion-injection' ? 'coercion' : f.id === 'fil-harassment' ? 'harassment' : 'mistreatment',
        priority: f.expected, quote: f.evidence, immediateDangerQuote: f.expected === 'high' ? f.evidence : null,
        reason: 'FIXED SYNTHETIC SIMULATION ONLY; needs human review, not a Claude result.',
      }] });
      return { usage: { inputTokens: 100, outputTokens: 100 }, decision };
    },
  };
}
module.exports = { createLocalAnalyzer };
