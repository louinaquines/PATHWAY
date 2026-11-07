import { useEffect, useRef } from 'react';
import Icon from './Icons';

export function PortalError({ message, onRetry, retryDisabled = false }) {
  return <div className="portal-error" role="alert">
    <Icon name="alert" size={18} />
    <span>{message}</span>
    {onRetry && <button type="button" className="portal-secondary" onClick={onRetry} disabled={retryDisabled}>Retry</button>}
  </div>;
}

export function PortalEmpty({ title, description }) {
  return <div className="portal-empty">
    <Icon name="clipboard" size={22} />
    <strong>{title}</strong>
    <p>{description}</p>
  </div>;
}

export function PortalFormDialog({ label, className, onCancel, closeOnBackdrop = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }, []);
  return <dialog ref={ref} className={className} aria-label={label} onClick={event => {
    if (!closeOnBackdrop || event.target !== event.currentTarget) return;
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
      onCancel();
    }
  }} onCancel={event => {
    event.preventDefault();
    onCancel();
  }}>{children}</dialog>;
}