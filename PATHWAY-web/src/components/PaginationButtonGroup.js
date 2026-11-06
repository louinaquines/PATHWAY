import Icon from './Icons';

export default function PaginationButtonGroup({ page, pageCount, onPageChange }) {
  if (pageCount <= 1) return null;

  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);

  return (
    <nav aria-label="Evaluation records pagination" className="pagination-group">
      <button
        type="button"
        className="pagination-button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <Icon name="chevronLeft" size={15} />
      </button>
      <span className="pagination-position">Page {page} of {pageCount}</span>
      {pages.map(pageNumber => (
        <button
          type="button"
          key={pageNumber}
          className={`pagination-button${pageNumber === page ? ' pagination-button-active' : ''}`}
          onClick={() => onPageChange(pageNumber)}
          aria-current={pageNumber === page ? 'page' : undefined}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        className="pagination-button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
      >
        <Icon name="chevronRight" size={15} />
      </button>
    </nav>
  );
}
