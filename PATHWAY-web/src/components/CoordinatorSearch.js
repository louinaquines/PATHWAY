import Icon from './Icons';

export function matchesCoordinatorSearch(query, ...values) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.filter(Boolean).join(' ').toLowerCase().includes(needle);
}

export default function CoordinatorSearch({ value, onChange, placeholder = 'Search by student name, ID, or section...', label = 'Search records' }) {
  return (
    <div className="coordinator-search" role="search">
      <Icon name="search" size={16} />
      <label className="sr-only" htmlFor="coordinator-record-search">{label}</label>
      <input
        id="coordinator-record-search"
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}
