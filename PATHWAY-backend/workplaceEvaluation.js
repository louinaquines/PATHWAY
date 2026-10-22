// Scores supplied, independently reviewed labels/results only; never calls a provider or invents reviews.
function scoreWorkplaceEvaluation(examples, results) {
  if (!Array.isArray(examples) || !examples.length || !Array.isArray(results) || results.length !== examples.length) throw Error('Complete reviewed evaluation required.');
  const ids = new Set(), map = new Map();
  for (const r of results) { if (!r || typeof r.id !== 'string' || map.has(r.id) || !['none','normal','high','unavailable'].includes(r.predicted)) throw Error('Invalid evaluation result.'); map.set(r.id,r.predicted); }
  const blank = () => ({ total:0, correct:0, falsePositives:0, falseNegatives:0, priorityErrors:0, unavailable:0, highPriorityMisses:0 });
  const summary = { ...blank(), byLanguage: {} };
  for (const e of examples) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || !map.has(e.id) || !['en','fil','ceb'].includes(e.language)
      || !['none','normal','high'].includes(e.expected) || typeof e.reviewedBy !== 'string' || !e.reviewedBy.trim()
      || typeof e.reviewedAt !== 'string' || !Number.isFinite(Date.parse(e.reviewedAt))) throw Error('Complete reviewed evaluation required.');
    ids.add(e.id); const p = map.get(e.id), counters = summary.byLanguage[e.language] ||= blank();
    for (const t of [summary,counters]) {
      t.total++; if (p === 'unavailable') t.unavailable++;
      else if (p === e.expected) t.correct++;
      else if (e.expected === 'none') t.falsePositives++;
      else if (p === 'none') t.falseNegatives++;
      else t.priorityErrors++;
      if (e.expected === 'high' && p !== 'high') t.highPriorityMisses++;
    }
  }
  return summary;
}
module.exports = { scoreWorkplaceEvaluation };
