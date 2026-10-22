// Request identities survive uncertain responses while the unchanged draft is open.
export function journalRevisionExpectation(entry) {
  return Object.fromEntries(['rawNotes', 'refined', 'aiRefined', 'hours', 'reviewedAt'].map(key => [key, entry[key] ?? null]));
}
export function createJournalMigrationClient(post, makeId) {
  const pending = {};
  async function send(kind, route, payload) {
    const key = JSON.stringify(payload);
    if (!pending[kind] || pending[kind].key !== key) pending[kind] = { key, requestId: makeId() };
    const identity = pending[kind];
    const result = await post(route, { ...payload, requestId: identity.requestId });
    if (pending[kind] === identity) delete pending[kind];
    return result;
  }
  return {
    submit: payload => send('journal', '/student/journals', payload),
    saveConsent: choice => send('consent', '/student/journal-analysis-consent', choice),
    readConsent: () => post('/student/journal-analysis-consent/read', {}),
    discardJournalDraft: () => { delete pending.journal; },
  };
}
