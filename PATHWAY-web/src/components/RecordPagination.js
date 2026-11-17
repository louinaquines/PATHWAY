import { useState } from 'react';

// Keep filters and exports on the full list; bound only what is rendered.
export function useRecordPage(records, scope = '', size = 25) {
  const [selection, setSelection] = useState({ scope, page: 1 });
  const pageCount = Math.max(1, Math.ceil(records.length / size));
  const page = Math.min(selection.scope === scope ? selection.page : 1, pageCount);
  const start = (page - 1) * size;
  return { items: records.slice(start, start + size), page, pageCount, total: records.length,
    start, size, onPageChange: value => setSelection({ scope, page: Math.max(1, Math.min(value, pageCount)) }) };
}

export default function RecordPagination({ pagination, label = 'Records', showSinglePage = false, compact = false }) {
  const { page, pageCount, total, start, size, onPageChange } = pagination;
  if (!showSinglePage && pageCount <= 1) return null;
  if (compact) return <nav className="section-student-pagination" aria-label={label + ' pagination'}>
    <span role="status">{start + 1}–{Math.min(start + size, total)} of {total} students</span>
    <div>
      <button type="button" className="portal-secondary" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}>‹</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" className="portal-secondary" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>›</button>
    </div>
  </nav>;
  return <nav className="portal-record-pagination" aria-label={label + ' pagination'}>
    <span role="status">{total ? start + 1 : 0}–{Math.min(start + size, total)} of {total}</span>
    <button type="button" className="portal-secondary" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</button>
    <span>Page {page} of {pageCount}</span>
    <button type="button" className="portal-secondary" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
  </nav>;
}
