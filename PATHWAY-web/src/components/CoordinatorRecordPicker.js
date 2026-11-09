import { useState } from 'react';
import { matchesCoordinatorSearch } from './CoordinatorSearch';
import RecordPagination, { useRecordPage } from './RecordPagination';

export default function CoordinatorRecordPicker({ label, name, options, value, onChange, required }) {
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState('');
  const selected = options.find(option => option.id === (value ?? selection));
  const matches = options.filter(option => matchesCoordinatorSearch(search, option.label));
  const page = useRecordPage(matches, search);
  const visible = selected && !page.items.some(option => option.id === selected.id)
    ? [selected, ...page.items] : page.items;

  return <div>
    <label>Search {label.toLowerCase()}<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    <label>{label}<select name={name} required={required} value={selected?.id ?? ''} onChange={event => {
      setSelection(event.target.value);
      onChange?.(event.target.value);
    }}>
      <option value="">Choose {label.toLowerCase()}</option>
      {visible.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
    </select></label>
    {!matches.length && <p role="status">No matches.</p>}
    <RecordPagination label={label + ' choices'} pagination={page} />
  </div>;
}
