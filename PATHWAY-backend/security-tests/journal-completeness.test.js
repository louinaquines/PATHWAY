const { test } = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../journalCompleteness');
const notes = 'Nag-test ako ng software. I learned debugging. Naayos ang bug. Walang naging problema.';
const entry = { rawNotes: notes, weekRange: '2026-10-19 – 2026-10-25', hours: 40 };
const rubric = (levels = ['full', 'full', 'full', 'full']) => ['tasks', 'learning', 'outcomes', 'challenges'].map((id, i) => ({ id, level: levels[i], reason: 'Evidence describes this criterion.', evidence: levels[i] === 'missing' ? '' : notes.split('. ')[i].replace(/\.$/, '') }));

test('approved weights, fractional credit and bands are calculated, never supplied by AI', () => {
  for (const [levels, metadata, total, status] of [
    [['full','full','full','full'], {}, 100, 'Sufficient detail'],
    [['partial','partial','partial','partial'], { hours: null }, 50, 'Needs more detail'],
    [['partial','partial','partial','partial'], {}, 55, 'Needs more detail'],
    [['missing','missing','missing','missing'], { hours: null, weekRange: '' }, 0, 'Incomplete'],
    [['full','full','missing','full'], {}, 80, 'Sufficient detail'],
    [['full','partial','full','partial'], {}, 80, 'Sufficient detail'],
    [['partial','partial','partial','partial'], { hours: null, weekRange: '' }, 45, 'Incomplete'],
    [['full','partial','full','missing'], {}, 72.5, 'Needs more detail'],
  ]) {
    const result = scoring.scoreJournalCompleteness({ ...entry, ...metadata }, rubric(levels));
    assert.equal(result.total, total); assert.equal(result.status, status);
    assert.equal(result.version, 'journal-completeness-v1');
    assert.equal(result.criteria.length, 5);
  }
});

test('missing submission and missing originals cannot become a numeric zero', () => {
  assert.deepEqual(scoring.scoreJournalCompleteness(null), { version: 'journal-completeness-v1', status: 'Not submitted', total: null, criteria: [] });
  for (const item of [{ refined: 'Polished text' }, { rawNotes: '   ' }, entry]) {
    const result = scoring.scoreJournalCompleteness(item);
    assert.equal(result.status, 'Analysis unavailable'); assert.equal(result.total, null);
  }
});

test('metadata requires actual ordered dates within seven days and finite numeric hours', () => {
  for (const [weekRange, hours, points] of [
    ['2026-10-19 – 2026-10-25', 168, 10], ['2024-02-29 – 2024-03-06', 0.5, 10],
    ['2026-02-29 – 2026-03-06', 40, 5], ['2026-10-25 – 2026-10-19', 40, 5],
    ['2026-10-19 – 2026-10-26', 40, 5], ['Oct 19 – Oct 25', 40, 5],
    ['Week 1', 40, 5], ['', 0, 0], [entry.weekRange, '40', 5],
    [entry.weekRange, Infinity, 5], [entry.weekRange, -1, 5], [entry.weekRange, 169, 5],
  ]) assert.equal(scoring.scoreJournalCompleteness({ ...entry, weekRange, hours }, rubric()).criteria[4].points, points);
});

test('rejects duplicate or omitted criteria, invalid judgments, unsupported quotes and extra fields', () => {
  const valid = rubric(); assert.deepEqual(scoring.validateNarrativeRubric(valid, notes), valid);
  for (const bad of [valid.slice(1), [...valid, valid[0]], [valid[0], valid[0], valid[2], valid[3]],
    valid.map((x, i) => i ? x : { ...x, total: 100 }),
    valid.map((x, i) => i ? x : { ...x, level: 'excellent' }),
    valid.map((x, i) => i ? x : { ...x, level: ['full'] }),
    valid.map((x, i) => i ? x : { ...x, evidence: 'invented achievement' }),
    valid.map((x, i) => i ? x : { ...x, level: 'missing' }),
    valid.map((x, i) => i ? x : { ...x, reason: '' }),
  ]) {
    assert.throws(() => scoring.validateNarrativeRubric(bad, notes));
    assert.equal(scoring.scoreJournalCompleteness(entry, bad).total, null);
  }
});

test('short original-language narratives receive the same arithmetic without keyword or length penalties', () => {
  for (const text of ['I tested. I learned. It passed. No issues.', 'Nag-test ako. Natuto ako. Naayos ko. Walang problema.', notes]) {
    const judgments = rubric().map(item => ({ ...item, evidence: text.split('.')[0] }));
    assert.equal(scoring.scoreJournalCompleteness({ ...entry, rawNotes: text }, judgments).total, 100);
  }
});
