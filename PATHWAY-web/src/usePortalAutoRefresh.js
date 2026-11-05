import { useEffect, useRef } from 'react';

// Background reads update data in place; they never reload or remount the page.
export default function usePortalAutoRefresh(refresh, { enabled = true, scope = '', protectInputs = true } = {}) {
  const latest = useRef({ refresh, enabled, protectInputs });
  latest.current = { refresh, enabled, protectInputs };
  useEffect(() => {
    let active = true, busy = false;
    const isCurrent = () => active && latest.current.enabled
      && !(latest.current.protectInputs && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'));
    const run = async () => {
      if (!active || busy || !latest.current.enabled || document.visibilityState === 'hidden' || navigator.onLine === false) return;
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      if (latest.current.protectInputs && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
      busy = true;
      try { await latest.current.refresh({ silent: true, isCurrent }); }
      catch { /* Existing page loaders retain their own error presentation. */ }
      finally { busy = false; }
    };
    const timer = window.setInterval(run, 10000);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, [scope]);
}
