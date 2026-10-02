import Icon from './Icons';

export function PageSkeleton({ label = 'Loading page', variant = 'table' }) {
  return (
    <div className={`page-skeleton page-skeleton-${variant}`} role="status" aria-label={label} aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton-page-heading">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
      </div>
      {variant === 'dashboard' && (
        <>
          <div className="skeleton-metric-grid">{Array.from({ length: 6 }, (_, index) => <div className="skeleton skeleton-metric" key={index} />)}</div>
          <div className="skeleton-chart-grid"><div className="skeleton skeleton-chart" /><div className="skeleton skeleton-chart" /></div>
          <div className="skeleton skeleton-chart-wide" />
        </>
      )}
      {variant === 'three-column' && (
        <div className="skeleton-three-column">
          <div className="skeleton-column"><div className="skeleton skeleton-toolbar" />{Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}</div>
          <div className="skeleton-column"><div className="skeleton skeleton-toolbar" />{Array.from({ length: 3 }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}</div>
          <div className="skeleton-column skeleton-detail"><Icon name="clipboard" size={24} /><div className="skeleton skeleton-detail-title" /><div className="skeleton skeleton-detail-text" /></div>
        </div>
      )}
      {variant === 'form' && (
        <div className="skeleton-card"><div className="skeleton skeleton-card-title" />{Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-input" key={index} />)}<div className="skeleton skeleton-button" /></div>
      )}
      {variant === 'cards' && (
        <div className="skeleton-card-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-record-card" key={index}><div className="skeleton skeleton-avatar" /><div className="skeleton skeleton-card-line" /><div className="skeleton skeleton-card-line short" /></div>)}</div>
      )}
      {variant === 'table' && (
        <div className="skeleton-card"><div className="skeleton skeleton-toolbar" />{Array.from({ length: 5 }, (_, index) => <div className="skeleton skeleton-table-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div>
      )}
      {variant === 'detail' && (
        <div className="skeleton-card"><div className="skeleton skeleton-detail-banner" />{Array.from({ length: 5 }, (_, index) => <div className="skeleton skeleton-table-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div>
      )}
    </div>
  );
}

export function InlineSkeleton({ label = 'Loading' }) {
  return <span className="inline-skeleton" role="status" aria-label={label}><span className="skeleton skeleton-inline" /><span className="sr-only">{label}</span></span>;
}
