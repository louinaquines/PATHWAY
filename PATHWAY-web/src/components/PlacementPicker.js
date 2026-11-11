import { useEffect, useState } from 'react';
import './PlacementPicker.css';
import { adminRequest } from '../adminApi';
export default function PlacementPicker({sectionId,view,queue,availability,label,name,required,onSelect,initialSelection, compact, emptyMessage}){
 const [search,setSearch]=useState('');const [term,setTerm]=useState('');const [cursors,setCursors]=useState([null]);const [data,setData]=useState({});const [selected,setSelected]=useState(initialSelection || null);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
 useEffect(()=>{const t=setTimeout(()=>setTerm(search.trim()),300);return()=>clearTimeout(t);},[search]);
 useEffect(()=>setCursors([null]),[term,sectionId]);
 useEffect(()=>{let active=true;setLoading(true);setError('');const params=new URLSearchParams({sectionId,view,search:term});if(queue)params.set('queue',queue);if(availability)params.set('availability',availability);if(cursors.at(-1))params.set('cursor',cursors.at(-1));adminRequest('/coordinator/placement-workspace?'+params).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[sectionId,view,queue,availability,term,cursors]);
 const items=data.students||data.companies||[];
 if (compact) {
   const itemLabel = item => item.name || [item.firstName, item.lastName].filter(Boolean).join(' ');
   return <div className="placement-search-picker">
     <input type="hidden" name={name} value={selected?.id || ''} />
     <details onBlur={event => {
       if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
     }} onKeyDown={event => {
       if (event.key !== 'Escape' || !event.currentTarget.open) return;
       event.stopPropagation();
       event.currentTarget.open = false;
       event.currentTarget.querySelector('summary').focus();
     }} onToggle={event => {
       if (event.currentTarget.open) event.currentTarget.querySelector('input[type="search"]').focus();
     }}>
       <summary aria-label={label + (selected ? ': ' + itemLabel(selected) : '')}>
         {selected ? itemLabel(selected) : 'Choose ' + label.toLowerCase()}
       </summary>
       <div className="placement-search-options">
         <input type="search" aria-label={'Search ' + label.toLowerCase()} placeholder={'Search ' + label.toLowerCase() + '…'} value={search}
           onChange={event => { setSearch(event.target.value); setCursors([null]); }} />
         {loading && <small role="status">Loading…</small>}
         {error && <small role="alert">{error}</small>}
         {!loading && !error && !items.length && <small role="status">{search ? 'No matches.' : emptyMessage}</small>}
         {!loading && !error && items.map(item => <button className="placement-picker-option" key={item.id} type="button" onClick={event => {
           const picker = event.currentTarget.closest('details');
           setSelected(item);
           onSelect?.(item.id, item);
           picker.open = false;
           picker.querySelector('summary').focus();
         }}>{itemLabel(item)}{item.idNumber && ' · ' + item.idNumber}</button>)}
         {(cursors.length > 1 || data.nextCursor) && <div className="review-actions">
           <button type="button" disabled={loading || cursors.length === 1} onClick={() => setCursors(cursors.slice(0, -1))}>Previous</button>
           <button type="button" disabled={loading || !data.nextCursor} onClick={() => setCursors([...cursors, data.nextCursor])}>Next</button>
         </div>}
       </div>
     </details>
   </div>;
 }
 return <fieldset className="placement-async-picker"><legend>{label}</legend><input aria-label={'Search '+label.toLowerCase()} type="search" value={search} placeholder={'Search '+label.toLowerCase()} onChange={e=>setSearch(e.target.value)}/><select aria-label={label} name={name} required={required} value={selected?.id||''} onChange={e=>{const item=items.find(i=>i.id===e.target.value)||null;setSelected(item);onSelect?.(item?.id||'');}}><option value="">Select {label.toLowerCase()}</option>{selected&&!items.some(i=>i.id===selected.id)&&<option value={selected.id}>{selected.name||[selected.firstName,selected.lastName].join(' ')}</option>}{items.map(i=><option key={i.id} value={i.id}>{i.name||[i.firstName,i.lastName].join(' ')}{i.idNumber?' · '+i.idNumber:''}{i.availableSlots===null?' · Capacity not set':i.availableSlots!==undefined?' · '+i.availableSlots+' slots available':''}</option>)}</select>{loading&&<small role="status">Loading…</small>}{error&&<small role="alert">{error}</small>}<div><button type="button" disabled={loading||cursors.length===1} onClick={()=>setCursors(v=>v.slice(0,-1))} aria-label={'Previous '+label+' page'}>‹</button><span>Page {cursors.length}</span><button type="button" disabled={loading||!data.nextCursor} onClick={()=>setCursors(v=>[...v,data.nextCursor])} aria-label={'Next '+label+' page'}>›</button></div></fieldset>
}
