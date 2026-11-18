import React, { useEffect, useRef, useState } from 'react';
import { registerSuccess } from '../successFx';
import './SuccessHost.css';

export default function SuccessHost() {
  const [pop, setPop] = useState(null);
  const [toasts, setToasts] = useState([]);
  const timer = useRef();
  useEffect(() => registerSuccess(item => {
    if (item.kind === 'toast') {
      setToasts(list => [...list.slice(-2), item]);
      setTimeout(() => setToasts(list => list.filter(t => t.id !== item.id)), 2600);
      return;
    }
    clearTimeout(timer.current);
    setPop(item);
    timer.current = setTimeout(() => setPop(null), 1500);
  }), []);
  return <>
    {pop && <div className="sfx-overlay" role="status" aria-live="polite" onClick={() => setPop(null)}>
      <div className="sfx-card" key={pop.id}>
        <svg className="sfx-mark" viewBox="0 0 52 52" aria-hidden="true"><circle className="sfx-circle" cx="26" cy="26" r="24" /><path className="sfx-check" d="M15 27 l7 7 l15 -16" /></svg>
        <strong>{pop.title}</strong>
        {pop.detail && <p>{pop.detail}</p>}
      </div>
    </div>}
    <div className="sfx-toasts" aria-live="polite">
      {toasts.map(t => <div className="sfx-toast" key={t.id}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>
        <span><b>{t.title}</b>{t.detail && <small>{t.detail}</small>}</span>
      </div>)}
    </div>
  </>;
}
