import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS } from '../theme';

export default function AttendanceCheckStatus({ actorId, sectionId, isCurrent, onDenied }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    adminRequest('/coordinator/attendance-risk-status', { deadlineMs: 15000 }).then(value => {
      if (active && isCurrent()) setResult(value);
    }).catch(error => {
      if (!active || !isCurrent()) return;
      setResult({ status: 'unavailable' });
      if ([401, 403].includes(error.status)) onDenied?.();
    });
    return () => { active = false; };
  }, [actorId, sectionId, isCurrent, onDenied]);
  let message = 'Checking automatic attendance status…';
  if (result?.status === 'disabled') message = 'Automatic attendance checks are not enabled for this demo.';
  else if (result) {
    const date = new Date(result.lastSuccessfulCheckAt);
    const last = result.lastSuccessfulCheckAt && Number.isFinite(date.getTime())
      ? `Last successful check: ${date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} (Philippine time).`
      : 'No successful check yet.';
    message = result.status === 'complete' ? last
      : result.status === 'pending' ? `${last} Automatic check pending; hourly catch-up will retry. Free-hosting delays are possible.`
        : 'Automatic check status unavailable. Completion cannot be confirmed.';
  }
  return <p role="status" style={{ color: COLORS.textMuted, fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>{message}</p>;
}
