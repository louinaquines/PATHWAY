import Icon from './Icons';

/* Numbered pager: ‹ 1 2 3 4 5 … 27 ›. `pages` may be a lower bound while the total is unknown. */
export function pageWindow(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
  if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '…', page - 1, page, page + 1, '…', pages];
}

export default function Pager({ page, pages, busy = false, onGo, label = 'Pages' }) {
  const items = pageWindow(page, Math.max(1, pages));
  return <nav className="pager" aria-label={label} aria-busy={busy || undefined}>
    <button type="button" className="pager-arrow" aria-label="Previous page" disabled={busy || page <= 1} onClick={() => onGo(page - 1)}><Icon name="chevronLeft" size={16} /></button>
    {items.map((item, i) => item === '…'
      ? <span key={'gap' + i} className="pager-gap" aria-hidden="true">…</span>
      : <button key={item} type="button" aria-current={item === page ? 'page' : undefined} aria-label={`Page ${item}`} disabled={busy && item !== page} onClick={() => item !== page && onGo(item)}>{item}</button>)}
    <button type="button" className="pager-arrow" aria-label="Next page" disabled={busy || page >= pages} onClick={() => onGo(page + 1)}><Icon name="chevronRight" size={16} /></button>
  </nav>;
}
