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
