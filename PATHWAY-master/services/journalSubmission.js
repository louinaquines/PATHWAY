// Request identities survive uncertain responses while the unchanged draft is open.
export function journalRevisionExpectation(entry) {
  return Object.fromEntries(['rawNotes', 'refined', 'aiRefined', 'hours', 'reviewedAt'].map(key => [key, entry[key] ?? null]));
}
export function createJournalMigrationClient(post, makeId, journalRoute = '/student/journals') {
  const pending = {};
  async function send(kind, route, payload) {
    const key = JSON.stringify(payload);
    if (!pending[kind] || pending[kind].key !== key) pending[kind] = { key, requestId: makeId() };
    const identity = pending[kind];
    let result;
    try { result = await post(route, { ...payload, requestId: identity.requestId }); }
    catch (error) {
      // A definite validation/authorization rejection did not commit a journal.
      if ([400, 401, 403, 404, 409, 422].includes(error.status) && pending[kind] === identity) delete pending[kind];
      throw error;
    }
    if (pending[kind] === identity) delete pending[kind];
    return result;
  }
  return {
    submit: payload => send('journal', journalRoute, payload),
    hasPendingJournal: () => Boolean(pending.journal),
    retryPendingJournal: () => pending.journal ? send('journal', journalRoute, JSON.parse(pending.journal.key)) : Promise.resolve(null),
    saveConsent: choice => send('consent', '/student/journal-analysis-consent', choice),
    readConsent: () => post('/student/journal-analysis-consent/read', {}),
    discardJournalDraft: () => { delete pending.journal; },
  };
}
