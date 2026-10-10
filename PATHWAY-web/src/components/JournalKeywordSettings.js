import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
export default function JournalKeywordSettings({ sectionId, keywords, onSaved }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { setText(Object.entries(keywords || {}).map(([name, words]) => `${name}: ${words.join(', ')}`).join('\n')); setMessage(''); }, [keywords, sectionId]);
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const dictionary = Object.create(null);
      for (const line of text.split('\n').filter(value => value.trim())) {
        const separator = line.indexOf(':');
        if (separator < 1) throw new Error('Use Category: keyword, keyword on each line.');
        const name = line.slice(0, separator).trim();
        if (Object.hasOwn(dictionary, name)) throw new Error('Each category must appear once.');
        dictionary[name] = line.slice(separator + 1).split(',').map(value => value.trim()).filter(Boolean);
      }
      const data = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/journal-keywords`, { method: 'PUT', body: JSON.stringify({ keywords: dictionary }) });
      onSaved(data.keywords); setMessage('Review keywords saved. No entries were changed.');
    } catch (failure) { setMessage(failure.message); }
    finally { setBusy(false); }
  };
  return <details className="journal-check-settings"><summary>Journal review settings</summary><p>One category per line. Keywords identify supporting words, not grades.</p>
    <label>Competency keywords<textarea rows={4} value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder="Technical: testing, debugging&#10;Teamwork: assisted, collaborated" /></label>
    <button type="button" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save keywords'}</button>{message && <p role="status">{message}</p>}
  </details>;
}
