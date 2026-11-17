import { useState } from 'react';

/* Section dropdown used in page headers (Requirements, Attendance & Journals). */
export default function SectionPicker({ sections = [], selected, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className="rq-section-pick" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button type="button" className="rq-section-face" aria-haspopup="listbox" aria-expanded={open} aria-label="Current section" disabled={!sections.length}
      onClick={() => setOpen(value => !value)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      {selected?.name || 'Choose section'}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <ul className="rq-section-menu" role="listbox" aria-label="Sections">
      {sections.map(section => <li key={section.id}><button type="button" role="option" aria-selected={section.id === selected?.id}
        onClick={() => { setOpen(false); if (section.id !== selected?.id) onChange?.(section); }}>
        <span>{section.name}</span>
        {section.id === selected?.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
      </button></li>)}
    </ul>}
  </div>;
}
