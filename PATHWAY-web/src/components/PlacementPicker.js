import personName from '../personName';
import { useEffect, useState } from 'react';
import './PlacementPicker.css';
import { adminRequest } from '../adminApi';
export default function PlacementPicker({sectionId,view,queue,availability,label,name,required,onSelect,initialSelection, compact, emptyMessage, multiple}){
 const [search,setSearch]=useState('');const [term,setTerm]=useState('');const [cursors,setCursors]=useState([null]);const [data,setData]=useState({});const [selected,setSelected]=useState(initialSelection || null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{const t=setTimeout(()=>setTerm(search.trim()),300);return()=>clearTimeout(t);},[search]);
 useEffect(()=>setCursors([null]),[term,sectionId]);
 useEffect(()=>{let active=true;setLoading(true);setError('');const params=new URLSearchParams({sectionId,view,search:term});if(queue)params.set('queue',queue);if(availability)params.set('availability',availability);if(cursors.at(-1))params.set('cursor',cursors.at(-1));adminRequest('/coordinator/placement-workspace?'+params).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[sectionId,view,queue,availability,term,cursors]);
 const [open,setOpen]=useState(false);
 const items=data.students||data.companies||[];
 if (compact) {
   const itemLabel = item => item.name || personName(item);
   const chosen = multiple ? (Array.isArray(selected) ? selected : []) : [];
   const isChosen = item => chosen.some(entry => entry.id === item.id);
   const toggle = item => {
     const next = isChosen(item) ? chosen.filter(entry => entry.id !== item.id) : [...chosen, item];
     setSelected(next);
     onSelect?.(next.map(entry => entry.id), next);
   };
   return <div className="placement-search-picker">
     {multiple ? chosen.map(item => <input key={item.id} type="hidden" name={name} value={item.id} />)
       : <input type="hidden" name={name} value={selected?.id || ''} />}
     {multiple && chosen.length > 0 && <div className="placement-chips" aria-label={'Selected ' + label.toLowerCase()}>
       {chosen.map(item => <span key={item.id} className="placement-chip">{itemLabel(item)}
         <button type="button" aria-label={'Remove ' + itemLabel(item)} onClick={() => toggle(item)}>×</button></span>)}
     </div>}
     <div className="placement-picker-field" onBlur={event => {
       if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setSearch(''); }
     }} onKeyDown={event => {
       if (event.key === 'Escape' && open) {
         event.stopPropagation();
         event.currentTarget.querySelector('input').focus();
         setOpen(false);
         setSearch('');
       }
     }}>
       <input type="text" autoComplete="off" aria-label={label} aria-expanded={open}
         role="combobox" aria-controls={name + '-placement-options'} aria-haspopup="dialog"
         placeholder={multiple ? (chosen.length ? 'Add more students' : 'Search and select students') : selected ? itemLabel(selected) : 'Choose ' + label.toLowerCase()}
         value={open || multiple ? search : selected ? itemLabel(selected) : ''}
         onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
         onKeyDown={event => {
           if (event.key === 'ArrowDown') {
             event.preventDefault();
             if (!open) setOpen(true);
             else event.currentTarget.parentElement.querySelector('.placement-picker-option')?.focus();
           }
           if (event.key === 'Enter' && open) event.preventDefault();
         }}
         onChange={event => { setOpen(true); setSearch(event.target.value); }} />
       {open && <div className="placement-search-options" id={name + '-placement-options'} role="dialog" aria-label={label + ' options'}>
         {loading && <small role="status">Loading…</small>}
         {error && <small role="alert">{error}</small>}
         {!loading && !error && !items.length && <small role="status">{search ? 'No matches.' : emptyMessage}</small>}
         {!loading && !error && multiple && items.map(item => <button className="placement-picker-option placement-picker-check" key={item.id} type="button" aria-pressed={isChosen(item)} onClick={() => toggle(item)}>
           <span className="placement-check-box" aria-hidden="true">{isChosen(item) ? '✓' : ''}</span>{itemLabel(item)}{item.idNumber && ' · ' + item.idNumber}</button>)}
         {!loading && !error && !multiple && items.map(item => <button className="placement-picker-option" key={item.id} type="button" onClick={event => {
           const picker = event.currentTarget.closest('.placement-picker-field');
           setSelected(item);
           onSelect?.(item.id, item);
           picker.querySelector('input').focus();
           setOpen(false);
           setSearch('');

         }}>{itemLabel(item)}{item.idNumber && ' · ' + item.idNumber}</button>)}
         {(cursors.length > 1 || data.nextCursor) && <div className="review-actions">
           <button type="button" disabled={loading || cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button>
           <button type="button" disabled={loading || !data.nextCursor} onClick={() => setCursors([...cursors, data.nextCursor])}>Next</button>
         </div>}
       </div>}
     </div>
   </div>;
 }
 return <fieldset className="placement-async-picker"><legend>{label}</legend><input aria-label={'Search '+label.toLowerCase()} type="search" value={search} placeholder={'Search '+label.toLowerCase()} onChange={e=>setSearch(e.target.value)}/><select aria-label={label} name={name} required={required} value={selected?.id||''} onChange={e=>{const item=items.find(i=>i.id===e.target.value)||null;setSelected(item);onSelect?.(item?.id||'');}}><option value="">Select {label.toLowerCase()}</option>{selected&&!items.some(i=>i.id===selected.id)&&<option value={selected.id}>{selected.name||[selected.firstName,selected.lastName].join(' ')}</option>}{items.map(i=><option key={i.id} value={i.id}>{i.name||[i.firstName,i.lastName].join(' ')}{i.idNumber?' · '+i.idNumber:''}{i.availableSlots===null?' · Capacity not set':i.availableSlots!==undefined?' · '+i.availableSlots+' slots available':''}</option>)}</select>{loading&&<small role="status">Loading…</small>}{error&&<small role="alert">{error}</small>}<div><button type="button" disabled={loading||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))} aria-label={'Previous '+label+' page'}>‹</button><span>Page {cursors.length}</span><button type="button" disabled={loading||!data.nextCursor} onClick={()=>setCursors(v=>[...v,data.nextCursor])} aria-label={'Next '+label+' page'}>›</button></div></fieldset>
}
