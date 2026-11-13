// PATHWAY-web/src/components/ServerWakeNotice.js
import { useEffect, useState } from 'react';
import * as adminApi from '../adminApi';
import './ServerWakeNotice.css';

// Shows a small notice when any backend request is slow (Render free tier sleeps and needs ~1 min to wake).
export default function ServerWakeNotice() {
  const [pending, setPending] = useState(0);
  const [slow, setSlow] = useState(false);
  const [verySlow, setVerySlow] = useState(false);

  useEffect(() => {
    // Tests may mock adminApi without these helpers.
    if (typeof adminApi.warmUpBackend === 'function') adminApi.warmUpBackend();
    return typeof adminApi.subscribeBackendPending === 'function' ? adminApi.subscribeBackendPending(setPending) : undefined;
  }, []);
  useEffect(() => {
    if (!pending) { setSlow(false); setVerySlow(false); return undefined; }
    const a = setTimeout(() => setSlow(true), 3000);
    const b = setTimeout(() => setVerySlow(true), 15000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [pending]);

  if (!slow) return null;
  return (
    <div className="server-wake-notice" role="status" aria-live="polite">
      <span className="server-wake-spinner" aria-hidden="true" />
      <div>
        <strong>Connecting to the server…</strong>
        <span>{verySlow ? 'Almost there. The server is starting up after being idle.' : 'This can take up to a minute after a period of inactivity.'}</span>
      </div>
    </div>
  );
}
