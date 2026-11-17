import { useEffect, useRef } from 'react';
import Icon from './Icons';

export function PortalError({ message, onRetry, retryDisabled = false }) {
  return <div className="portal-error" role="alert">
    <Icon name="alert" size={18} />
    <span>{message}</span>
    {onRetry && <button type="button" className="portal-secondary" onClick={onRetry} disabled={retryDisabled}>Retry</button>}
  </div>;
}

export function PortalEmpty({ title, description, icon = 'clipboard', steps, action, compact = false }) {
  return <div className={'portal-empty' + (compact ? ' is-compact' : '')} role="status">
    <span className="portal-empty-icon" aria-hidden="true"><Icon name={icon} size={compact ? 20 : 26} /></span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    {steps?.length > 0 && <ol className="portal-empty-steps">{steps.map(step => <li key={step}>{step}</li>)}</ol>}
    {action && <button type="button" className="portal-empty-action" onClick={action.onClick}>{action.label}</button>}
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