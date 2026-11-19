import personName from '../personName';
import { compareStudents } from '../coordinatorStudentSort';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { quietly, showSuccess, showNotice } from '../successFx';
// src/pages/SectionsTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton, InlineSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import { adminRequest } from '../adminApi';
import { PortalEmpty } from '../components/PortalStates';
import RequirementAutoCheckDialog from '../components/RequirementAutoCheckDialog';
import '../components/RequirementAutoCheckDialog.css';
import './SectionsTab.css';
import './RequirementsRedesign.css';
import './LogbookRedesign.css';
import './SectionsRedesign.css';
import Pager from '../components/Pager';
import { TermPicker, TermDialog } from '../components/TermManager';
import { createPortal } from 'react-dom';
import { SectionsSkeleton } from '../components/CoordSkeletons';

function groupChatHref(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim())) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export default function SectionsTab({ coordinatorId, selectedSection: sharedSection, onSectionChange, journalSettings, sectionActions, department, onAddStudents, onManageAccounts }) {
  const [sections, setSections]         = useState([]);
  const [students, setStudents]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [view, setView]                 = useState('students'); // 'students' | 'requirements'
  const [modal, setModal]               = useState(false);
  const [reqModal, setReqModal]         = useState(null); // null | 'add'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm]                 = useState({ name: '', year: '', section: '', hoursRequired: '', messengerLink: '' });
  const [autoCheckReq, setAutoCheckReq] = useState(null);
  const [reqForm, setReqForm]           = useState({ label: '', category: 'Pre-OJT', deadline: '', submissionLink: '' });
  const [linkReq, setLinkReq] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [stuQuery, setStuQuery]         = useState('');
  const [stuPage, setStuPage]           = useState(1);
  const [addOpen, setAddOpen]           = useState(false);
  const [reqStage, setReqStage]         = useState('Pre-OJT');
  const [reqPage, setReqPage]           = useState(1);
  const [terms, setTerms] = useState([]);
  const [termFilter, setTermFilter] = useState(null);
  const [termDialog, setTermDialog] = useState(false);
  const [termBusy, setTermBusy] = useState(false);
  const loadTerms = useCallback(async () => {
    try { const d = await adminRequest('/coordinator/terms'); setTerms(d.terms || []); setTermFilter(f => (f && (f === 'all' || (d.terms || []).some(t => t.id === f))) ? f : ((d.terms || []).find(t => t.isCurrent)?.id || 'all')); }
    catch { setTerms([]); setTermFilter(f => f ?? 'all'); }
  }, []);
  useEffect(() => { loadTerms(); }, [loadTerms]);
  const changeSectionTerm = async (sec, termId) => {
    setTermBusy(true);
    try { const r = await adminRequest(`/coordinator/sections/${encodeURIComponent(sec.id)}/term`, { method: 'PATCH', body: JSON.stringify({ termId }) });
      const upd = x => x.id === sec.id ? { ...x, termId: r.termId, termName: r.termName } : x; setSections(p => p.map(upd)); setSelected(p => p && upd(p)); }
    catch (e) { console.error(e); } finally { setTermBusy(false); }
  };
  const [topHost, setTopHost]           = useState(null);
  useEffect(() => { setTopHost(document.getElementById('sx-top-actions')); }, []);

  // Section names always follow "PROGRAM - 4A". Typing the name fills the year and letter;
  // picking a year or letter rewrites the name, so the three never disagree.
  const parseSectionName = name => {
    const match = String(name).trim().toUpperCase().match(/^([A-Z]+)?\s*-?\s*([1-4])?([A-Z])?$/);
    return match ? { program: match[1] || '', year: match[2] || '', section: match[3] || '' } : null;
  };
  function updateSectionName(value) {
    const parsed = parseSectionName(value);
    setForm(previous => ({ ...previous, name: value, year: parsed ? parsed.year : '', section: parsed ? parsed.section : '' }));
  }
  function updateSectionChoice(key, value) {
    setForm(previous => {
      const next = { ...previous, [key]: value };
      const program = parseSectionName(previous.name)?.program || String(previous.name).trim().split(/[\s-]+/)[0].toUpperCase() || 'BSIT';
      next.name = program + (next.year || next.section ? ' - ' + next.year + next.section : '');
      return next;
    });
  }
  const formattedSectionName = () => {
    const parsed = parseSectionName(form.name);
    return parsed?.program && form.year && form.section ? `${parsed.program} - ${form.year}${form.section}` : form.name.trim();
  };

  const [chatSave, setChatSave] = useState(null);
  const chatHref = groupChatHref(selected?.messengerLink);

  async function saveGroupChat(event, section) {
    event.preventDefault();
    const messengerLink = new FormData(event.currentTarget).get('messengerLink').trim();
    setChatSave({ id: section.id, busy: true });
    try {
      const result = await adminRequest('/coordinator/sections/' + encodeURIComponent(section.id) + '/group-chat', {
        method: 'PATCH', body: JSON.stringify({ messengerLink }),
      });
      const updated = { ...section, messengerLink: result.messengerLink };
      setSections(previous => previous.map(item => item.id === section.id ? updated : item));
      setSelected(previous => previous?.id === section.id ? updated : previous);
      setChatSave({ id: section.id, message: 'Group chat link saved.' });
    } catch (error) {
      setChatSave({ id: section.id, message: error.message, failed: true });
    }
  }

  const CATEGORIES = ['Pre-OJT', 'Ongoing', 'Post-OJT'];
  const filteredSections = sections.filter(section => matchesCoordinatorSearch(searchQuery, section.name, section.department)
    && (!termFilter || termFilter === 'all' || (termFilter === 'none' ? !section.termId : section.termId === termFilter)));
  const filteredStudents = students.filter(student => matchesCoordinatorSearch(stuQuery, student.firstName, student.lastName, student.idNumber, student.companyName || student.company));

  const fetchSections = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [coordinatorId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const fetchStudents = async (section) => {
    setSelected(section);
    onSectionChange?.(section);
    setView('students');
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', section.department), where('sectionId', '==', section.id)));
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!sharedSection) return;
    setSelected(sharedSection);
    let cancelled = false;
    getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', sharedSection.department), where('sectionId', '==', sharedSection.id)))
      .then(snap => { if (!cancelled) setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [sharedSection]);

  usePortalAutoRefresh(async ({ isCurrent }) => {
    const sectionSnap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
    if (!isCurrent()) return;
    setSections(sectionSnap.docs.map(item => ({ id: item.id, ...item.data() })));
    if (!selected) return;
    const [studentSnap, requirementsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', selected.department), where('sectionId', '==', selected.id))),
      getDocs(collection(db, 'sections', selected.id, 'requirements')),
    ]);
    if (!isCurrent()) return;
    setStudents(studentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
    setRequirements(requirementsSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a,b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category)));
  }, { enabled: !loading && !saving && !modal && !reqModal, scope: selected?.id || '' });

  const fetchRequirements = async (section) => {
    setSelected(section);
    setView('requirements');
    try {
      const snap = await getDocs(collection(db, 'sections', section.id, 'requirements'));
      if (snap.empty) {
        const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(section.id)}/requirements/defaults`, { method: 'POST' });
        setRequirements(result.requirements);
      } else {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => {
          const order = ['Pre-OJT', 'Ongoing', 'Post-OJT'];
          return order.indexOf(a.category) - order.indexOf(b.category);
        });
        setRequirements(reqs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    const assignedDepartment = department || sharedSection?.department;
    if (!form.name.trim() || !assignedDepartment || !form.year || !form.section || !form.hoursRequired) return;
    setSaving(true);
    try {
      await adminRequest('/coordinator/sections', {
        method: 'POST',
        body: JSON.stringify({
          name: formattedSectionName(), department: assignedDepartment, hoursRequired: Number(form.hoursRequired), messengerLink: form.messengerLink.trim(), termId: form.termId || undefined,
        }),
      });
      setModal(false);
      setForm({ name: '', year: '', section: '', hoursRequired: '', messengerLink: '' });
      fetchSections();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRequirement = async () => {
    if (!reqForm.label.trim()) return;
    setSaving(true);
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements`, {
        method: 'POST', body: JSON.stringify({ label: reqForm.label.trim(), category: reqForm.category, deadline: reqForm.deadline, submissionLink: (reqForm.submissionLink || '').trim() }),
      });
      setReqModal(null);
      setReqForm({ label: '', category: 'Pre-OJT', deadline: '' });
      fetchRequirements(selected);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDeadline = async (reqId, deadline) => {
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'PATCH', body: JSON.stringify({ deadline }),
      });
      setRequirements(prev => prev.map(r => r.id === reqId ? { ...r, deadline } : r));
    } catch (e) {
      console.error(e);
    }
  };

  const [bulk, setBulk] = useState({ date: '', scope: 'all', busy: false, msg: '' });
  const applyDeadlineToAll = async (event) => {
    event.preventDefault();
    if (!bulk.date || !selected) return;
    setBulk(b => ({ ...b, busy: true, msg: '' }));
    try {
      const snap = await getDocs(collection(db, 'sections', selected.id, 'requirements'));
      const targets = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => bulk.scope === 'all' || r.category === bulk.scope);
      await Promise.all(targets.map(r => adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(r.id)}`, {
        method: 'PATCH', body: JSON.stringify({ deadline: bulk.date }),
      })));
      const ids = new Set(targets.map(r => r.id));
      setRequirements(prev => prev.map(r => ids.has(r.id) ? { ...r, deadline: bulk.date } : r));
      setBulk(b => ({ ...b, busy: false, msg: `Deadline set for ${targets.length} document${targets.length === 1 ? '' : 's'}.` }));
    } catch (e) {
      console.error(e);
      setBulk(b => ({ ...b, busy: false, msg: 'Couldn’t update the deadlines. Try again.', bad: true }));
    }
  };

  const handleDeleteRequirement = async (reqId) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'DELETE',
      });
      setRequirements(prev => prev.filter(r => r.id !== reqId));
      setDeleteConfirm(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const recordsPage = useRecordPage(filteredStudents.sort(compareStudents), (selected?.id || '') + ':' + searchQuery);
  const sectionsPage = useRecordPage(filteredSections, searchQuery + ':' + termFilter);
  if (loading) {
    return <SectionsSkeleton />;
  }

  return (
    <div className="sx">
      {(() => { const btn = <><TermPicker terms={terms} value={termFilter || 'all'} onChange={setTermFilter} onManage={() => setTermDialog(true)} />{selected && <>
          <button type="button" className="rq-btn sx-topbtn" onClick={() => onAddStudents ? onAddStudents() : setAddOpen(!addOpen)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add students</button>
          {onManageAccounts && <button type="button" className="rq-btn sx-topbtn" onClick={onManageAccounts}><Icon name="users" size={15} />Manage accounts</button>}</>}
        <button type="button" className="rq-btn sx-new" onClick={() => setModal(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>New Section</button></>;
        return topHost ? createPortal(btn, topHost) : <div className="sx-inline">{btn}</div>; })()}
      {termDialog && <TermDialog terms={terms} onClose={() => setTermDialog(false)} onChanged={loadTerms} />}
      <aside className="sx-list">
        <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search sections" placeholder="Search sections" />
        {filteredSections.length === 0 && (searchQuery ? <p className="sx-empty">No sections match “{searchQuery}”.</p>
          : sections.length && termFilter !== 'all' ? <p className="sx-empty">No sections in this term. <button type="button" className="rq-link" onClick={() => setTermFilter('all')}>Show all terms</button></p>
          : <PortalEmpty compact icon="section" title="No sections yet" description="Click New Section to create your first one." />)}
        {sectionsPage.items.map(sec => { const on = selected?.id === sec.id; const n = on ? students.length : Array.isArray(sec.studentIds) ? sec.studentIds.length : null;
          return <button key={sec.id} type="button" className="section-select sx-card" aria-pressed={on} onClick={() => { setStuPage(1); setAddOpen(false); fetchStudents(sec); }}>
            <strong>{sec.name}</strong><small>{[n != null ? `${n} student${n === 1 ? '' : 's'}` : null, sec.hoursRequired ? `${sec.hoursRequired} hrs` : null, termFilter === 'all' || termFilter === 'none' ? sec.termName || null : null].filter(Boolean).join(' · ')}</small>
          </button>; })}
        <RecordPagination pagination={sectionsPage} label="Sections" />
      </aside>
      <section className="sx-detail">
        {!selected ? (sections.length === 0
          ? <PortalEmpty icon="section" title="Create your first section" description="A section groups your OJT students, their required hours and the documents they must submit."
              steps={['Create a section (name and required hours)', 'Add students or approve sign-ups', 'Set requirements, deadlines and reference files']} action={{ label: '+ New Section', onClick: () => setModal(true) }} />
          : <PortalEmpty icon="section" title="Select a section" description="Pick a section on the left to manage students, requirements and deadlines." />)
        : (() => { const pending = students.filter(x => !x.accountApproved).length; const pages = Math.max(1, Math.ceil(filteredStudents.length / 10)); const cur = Math.min(stuPage, pages);
          const rows = [...filteredStudents].sort(compareStudents).slice((cur - 1) * 10, cur * 10);
          return <>
            <header className="sx-head">
              <div><h2>{selected.name}</h2>
                <p>{[selected.hoursRequired ? `${selected.hoursRequired} hours required` : null, requirements.length && view === 'requirements' ? `${requirements.length} required documents` : null, selected.department].filter(Boolean).join(' · ')}
                  </p></div>
              {chatHref ? <a className="rq-btn sx-chatbtn" href={chatHref} target="_blank" rel="noreferrer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></svg>Open Group Chat</a>
                : <button type="button" className="rq-btn sx-chatbtn" onClick={() => setView('rules')}>Add a group chat</button>}
            </header>
            <div className="rq-stages sx-tabs" role="tablist" aria-label="Section view" style={{ '--count': 3, '--index': view === 'requirements' ? 1 : view === 'rules' ? 2 : 0 }}>
              <span className="rq-stages-thumb" aria-hidden="true" />
              <button type="button" role="tab" aria-selected={view === 'students'} onClick={() => fetchStudents(selected)}><i data-tone="mute" aria-hidden="true" /><strong>Students · {students.length}</strong></button>
              <button type="button" role="tab" aria-selected={view === 'requirements'} onClick={() => fetchRequirements(selected)}><i data-tone="mute" aria-hidden="true" /><strong>Required documents{view === 'requirements' && requirements.length ? ` · ${requirements.length}` : ''}</strong></button>
              <button type="button" role="tab" aria-selected={view === 'rules'} onClick={() => setView('rules')}><i data-tone="mute" aria-hidden="true" /><strong>Rules and deadlines</strong></button>
            </div>
            <div hidden={view !== 'students'} className="sx-panel">
              <div className="sx-tools">
                <CoordinatorSearch value={stuQuery} onChange={v => { setStuQuery(v); setStuPage(1); }} label="Find a student" placeholder="Find a student" />
                {pending > 0 && <b className="lb-chip sx-pending" data-tone="amber" title={`${pending} account${pending === 1 ? ' is' : 's are'} waiting for approval`}>{pending} waiting for approval</b>}
                <span className="sx-grow" />
                {sectionActions}
              </div>
              {addOpen && <div className="sx-add"><div className="sx-add-head"><strong>Add students</strong><span>Students in your department who haven’t joined a section.</span></div>
                <UnassignedStudents sectionId={selected.id} department={selected.department} onAssign={() => fetchStudents(selected)} /></div>}
              {filteredStudents.length === 0
                ? <div className="sx-emptybox"><strong>{stuQuery ? 'No matching students' : 'No enrolled students yet'}</strong><span>{stuQuery ? 'Try another name or student ID.' : 'Use Add students to put students in this section.'}</span></div>
                : <div className="sx-table" role="table" aria-label="Section students">
                    <div className="sx-row sx-rowhead" role="row"><span role="columnheader">Student ID</span><span role="columnheader">Name</span><span role="columnheader">Company</span><span role="columnheader">Account</span></div>
                    {rows.map(student => <div key={student.id} className="sx-row" role="row">
                      <span role="cell" className="sx-id">{student.idNumber || '—'}</span>
                      <span role="cell" className="sx-name">{personName(student)}</span>
                      <span role="cell" className="sx-co" data-none={!(student.companyName || student.company) || undefined}>{student.companyName || student.company || 'No company yet'}</span>
                      <span role="cell"><b className="lb-chip" data-tone={student.accountApproved ? 'green' : 'amber'}>{student.accountApproved ? 'Active' : 'Pending approval'}</b></span>
                    </div>)}
                  </div>}
              {filteredStudents.length > 10 && <div className="sx-foot"><span>{(cur - 1) * 10 + 1}–{Math.min(cur * 10, filteredStudents.length)} of {filteredStudents.length}</span><Pager page={cur} pages={pages} onGo={setStuPage} label="Section students" /></div>}
            </div>
            {view === 'requirements' && (() => {
              const now = new Date(); const overdue = r => r.deadline && new Date(r.deadline + 'T23:59:59') < now;
              const stages = [['Pre-OJT', 'Before OJT'], ['Ongoing', 'During OJT'], ['Post-OJT', 'After OJT']];
              const list = requirements.filter(r => r.category === reqStage);
              const pages = Math.max(1, Math.ceil(list.length / 8)); const cur = Math.min(reqPage, pages);
              const rows = list.slice((cur - 1) * 8, cur * 8);
              const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Set a date';
              const saveLink = async value => {
                setLinkBusy(true); setLinkErr('');
                try { const ids = linkReq.all ? requirements.map(r2 => r2.id) : [linkReq.id]; const saved = {};
                  await quietly(async () => { for (const id of ids) { const r = await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(id)}/link`, { method: 'PATCH', body: JSON.stringify({ submissionLink: value }) }); saved[id] = r.submissionLink; } });
                  showSuccess(value ? 'Link saved' : 'Link removed', ids.length > 1 ? `${value ? 'Applied to' : 'Removed from'} ${ids.length} documents.` : '');
                  setRequirements(prev => prev.map(r2 => r2.id in saved ? { ...r2, submissionLink: saved[r2.id] } : r2)); setLinkReq(null); }
                catch (e) { setLinkErr(e.message || 'Could not save the link.'); } finally { setLinkBusy(false); }
              };
              return <div className="sx-panel sx-req">
                {linkReq && createPortal(<div className="sx-overlay tm-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !linkBusy) setLinkReq(null); }}>
                  <div className="tm" role="dialog" aria-modal="true" aria-label="Submission link">
                    <header className="tm-head"><div><h2>Submission link</h2><p>{linkReq.label} · students open this link to submit, then tap “I’ve submitted it”.</p></div>
                      <button type="button" className="plt-x" aria-label="Close" disabled={linkBusy} onClick={() => setLinkReq(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></header>
                    <div className="tm-body tm-form"><label><span>Link</span><input autoFocus type="url" placeholder="https://drive.google.com/drive/folders/…" value={linkReq.value} onChange={e => { setLinkErr(''); setLinkReq(l => ({ ...l, value: e.target.value })); }} /></label>
                      <label className="sx-linkall"><input type="checkbox" checked={Boolean(linkReq.all)} onChange={e => setLinkReq(l => ({ ...l, all: e.target.checked }))} /><span>Apply to all {requirements.length} documents in this section</span></label>
                      {linkReq.confirmRemove && <p role="alert" className="tm-err">This removes the link{linkReq.all ? ' from all documents' : ''}. Students will upload in PATHWAY instead. Click Remove link again to confirm.</p>}{linkErr && <p role="alert" className="tm-err">{linkErr}</p>}</div>
                    <footer className="tm-foot">
                      {(linkReq.had || linkReq.all) && <button type="button" className="rq-btn sx-linkremove" disabled={linkBusy} onClick={() => linkReq.confirmRemove ? saveLink('') : setLinkReq(l => ({ ...l, confirmRemove: true }))}>{linkReq.confirmRemove ? 'Confirm remove' : 'Remove link'}</button>}
                      <span className="tm-grow" />
                      <button type="button" className="rq-btn" disabled={linkBusy} onClick={() => setLinkReq(null)}>Cancel</button>
                      <button type="button" className="rq-btn rq-primary" disabled={linkBusy} onClick={() => { if (!linkReq.value.trim()) { setLinkErr('Paste a link first, or use Remove link.'); return; } saveLink(linkReq.value.trim()); }}>{linkBusy ? 'Saving…' : linkReq.all ? 'Save to all' : 'Save link'}</button></footer>
                  </div></div>, document.body)}
                {autoCheckReq && <RequirementAutoCheckDialog sectionId={selected.id} requirement={autoCheckReq} onClose={() => setAutoCheckReq(null)}
                  onSaved={autoCheck => setRequirements(prev => prev.map(r => r.id === autoCheckReq.id ? { ...r, autoCheck } : r))} />}
                <div className="sx-req-tools">
                  <div className="sx-stage" role="tablist" aria-label="OJT stage">
                  {stages.map(([k, l]) => { const items = requirements.filter(r => r.category === k); const late = items.filter(overdue).length;
                    return <button key={k} type="button" role="tab" aria-selected={reqStage === k} onClick={() => { setReqStage(k); setReqPage(1); }}>
                      {l}<b>{items.length}</b></button>; })}
                  </div>
                  <button type="button" className="rq-btn sx-addreq" onClick={() => { setReqModal('add'); setReqForm({ label: '', category: reqStage, deadline: '', submissionLink: '' }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add requirement</button>
                </div>
                {!list.length ? <div className="sx-emptybox"><strong>No documents in this stage</strong><span>Use Add requirement to add one.</span></div>
                : <div className="sx-reqlist"><div className="sx-reqrow sx-reqhead" aria-hidden="true"><span>Document</span><span>Deadline</span><span>Status</span><span>Actions</span></div>{rows.map(req => { const late = overdue(req); const ref = req.autoCheck?.referenceName;
                  return <div key={req.id} className="sx-reqrow" data-late={late || undefined}>
                    <span className="sx-reqname" title={req.label}>{req.label}{req.submissionLink && <b className="sx-linktag">Link</b>}</span>
                    <label className="sx-date" data-empty={!req.deadline || undefined}><span>{fmt(req.deadline)}</span>
                      <input type="date" aria-label={`${req.label} deadline`} className="req-date" value={req.deadline || ''} onChange={e => handleUpdateDeadline(req.id, e.target.value)} /></label>
                    <span className="sx-status"><b className="lb-chip" data-tone={!req.deadline ? 'mute' : late ? 'red' : 'green'}>{!req.deadline ? 'No deadline' : late ? 'Overdue' : 'Active'}</b></span>
                    <span className="sx-acts"><button type="button" className="sx-icon sx-linkbtn" data-on={req.submissionLink ? 'true' : undefined} onClick={() => { setLinkErr(''); setLinkReq({ id: req.id, label: req.label, value: req.submissionLink || '', had: Boolean(req.submissionLink) }); }} title={req.submissionLink ? 'Edit submission link' : 'Add submission link'} aria-label={`Submission link for ${req.label}`}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg></button>
                    <button type="button" className="sx-icon sx-ref" data-on={ref || req.autoCheck?.enabled ? 'true' : undefined} onClick={() => setAutoCheckReq(req)} title={ref ? `Reference: ${ref}` : req.autoCheck?.enabled ? 'Auto-check on · add reference' : 'Add reference file'} aria-label={ref ? `Reference file for ${req.label}: ${ref}` : `Add reference file for ${req.label}`}>
                      {ref ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 12v6M9 15h6" /></svg>}
                      </button>
                    <button type="button" className="sx-icon sx-del" onClick={() => setDeleteConfirm(req)} title="Delete requirement" aria-label="Delete requirement"><Icon name="trash" size={15} /></button></span>
                  </div>; })}</div>}
                {list.length > 8 && <div className="sx-foot"><span>{(cur - 1) * 8 + 1}–{Math.min(cur * 8, list.length)} of {list.length}</span><Pager page={cur} pages={pages} onGo={setReqPage} label="Requirements" /></div>}
              </div>; })()}
            <div hidden={view !== 'rules'} className="sx-panel sx-rules">
              <div className="sx-set"><div><h3>Term</h3><p>Which semester this section belongs to.</p></div>
                <span className="sx-selwrap"><select aria-label="Section term" disabled={termBusy} value={selected.termId || ''} onChange={e => changeSectionTerm(selected, e.target.value)}>
                  <option value="">No term</option>{terms.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></div>
              <div className="sx-set"><div><h3>Required hours</h3><p>Every student in {selected.name} must render this.</p></div><b className="sx-val">{selected.hoursRequired || '—'} hours</b></div>
              <div className="sx-set"><div><h3>Journals</h3><p>How often students write a journal.</p></div><div className="sx-journal">{journalSettings || <span className="sx-muted">Not available</span>}</div></div>
              <div className="sx-set sx-set-col"><div><h3>Group chat</h3><p>Students see this link in their app.</p></div>
                <form className="sx-chatform" key={selected.id + ':' + chatHref} onSubmit={event => saveGroupChat(event, selected)}>
                  <label className="sx-sr" htmlFor="sx-chat">Group chat link</label>
                  <input id="sx-chat" name="messengerLink" type="url" maxLength={500} defaultValue={chatHref} placeholder="https://m.me/j/…" aria-label="Group chat link" />
                  <button type="submit" className="rq-btn rq-primary" disabled={chatSave?.busy}>Save group chat link</button>
                  {chatSave?.id === selected.id && chatSave.message && <p role={chatSave.failed ? 'alert' : 'status'} className="sx-chatmsg" data-bad={chatSave.failed || undefined}>{chatSave.message}</p>}
                </form></div>
              <div className="sx-set sx-set-col"><div className="sx-set-head"><div><h3>Deadlines</h3><p>Each required document has its own deadline.</p></div><button type="button" className="rq-btn" onClick={() => fetchRequirements(selected)}>Set deadlines</button></div>
                <form className="sx-bulk" onSubmit={applyDeadlineToAll}>
                  <p className="sx-bulk-title">Optional · Use one date for many documents</p>
                  <div className="sx-bulk-row">
                  <span className="sx-selwrap"><select aria-label="Apply to" value={bulk.scope} onChange={e => setBulk(b => ({ ...b, scope: e.target.value, msg: '' }))}>
                    <option value="all">All documents</option><option value="Pre-OJT">Before OJT documents</option><option value="Ongoing">During OJT documents</option><option value="Post-OJT">After OJT documents</option>
                  </select><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
                  <input type="date" aria-label="Deadline for all" value={bulk.date} onChange={e => setBulk(b => ({ ...b, date: e.target.value, msg: '' }))} />
                  <button type="submit" className="rq-btn" disabled={!bulk.date || bulk.busy}>{bulk.busy ? 'Saving…' : 'Apply to all'}</button>
                  </div>
                  {bulk.msg && <p role="status" className="sx-chatmsg" data-bad={bulk.bad || undefined}>{bulk.msg}</p>}
                </form></div>
            </div>
          </>; })()}
      </section>
      {/* Create Section Modal */}
      {modal && createPortal(
        <div style={t.overlay} className="sx-overlay">
          <div className="section-modal" style={t.modalCard}>
            <h2 style={t.modalTitle}>Create New Section</h2>
            <div style={t.field}>
              <label htmlFor="new-section-name" style={t.label}>Section name</label>
              <input
                style={t.input}
                id="new-section-name" placeholder="e.g. BSIT - 4A"
                value={form.name}
                onChange={e => updateSectionName(e.target.value)}
                required
              />
            </div>
            <div className="section-year-choices">
              <label style={t.label}>Year level<select aria-label="Year level" style={t.select} value={form.year} onChange={e => updateSectionChoice('year', e.target.value)} required disabled={saving}><option value="">Select year</option>{[1, 2, 3, 4].map(year => <option key={year} value={year}>{year}{year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} year</option>)}</select></label>
              <label style={t.label}>Section letter<select aria-label="Section letter" style={t.select} value={form.section} onChange={e => updateSectionChoice('section', e.target.value)} required disabled={saving}><option value="">Select section</option>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => <option key={letter} value={letter}>{letter}</option>)}</select></label>
            </div>
            <div style={t.field}>
              <label style={t.label}>Required internship hours</label>
              <input
                style={t.input}
                type="number"
                placeholder="e.g. 486"
                value={form.hoursRequired}
                onChange={e => setForm(f => ({ ...f, hoursRequired: e.target.value }))}
                required
              />
            </div>
            <div style={t.field}>
              <label style={t.label}>Term</label>
              <select style={t.input} value={form.termId ?? (terms.find(x => x.isCurrent)?.id || '')} onChange={e => setForm(f => ({ ...f, termId: e.target.value }))}>
                <option value="">No term</option>
                {terms.map(x => <option key={x.id} value={x.id}>{x.name}{x.isCurrent ? ' (current)' : ''}</option>)}
              </select>
            </div>
            <div style={t.field}>
              <label style={t.label}>Messenger group link (optional)</label>
              <input
                style={t.input}
                placeholder="https://m.me/join/..."
                value={form.messengerLink}
                onChange={e => setForm(f => ({ ...f, messengerLink: e.target.value }))}
              />
            </div>
            <div style={t.modalBtns}>
              <button style={t.cancelBtn} onClick={() => setModal(false)}>Cancel</button>
              <button
                style={{ ...t.confirmBtn, opacity: saving ? 0.6 : 1 }}
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Add Requirement Modal */}
      {reqModal === 'add' && createPortal(
        <div style={t.overlay} className="sx-overlay" onClick={() => setReqModal(null)}>
          <div className="arq" role="dialog" aria-modal="true" aria-label="Add a requirement" onClick={e => e.stopPropagation()}>
            <div className="arq-head"><div><h2>Add a requirement</h2><p>{selected?.name}</p></div>
              <button type="button" className="plt-x" aria-label="Close" onClick={() => setReqModal(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
            <div className="arq-body">
              <label className="arq-field">Requirement name
                <input placeholder="e.g. Weekly Progress Presentation" value={reqForm.label} onChange={e => setReqForm(f => ({ ...f, label: e.target.value }))} required autoFocus /></label>
              <div className="arq-pair">
                <label className="arq-field">Internship stage
                  <span className="arq-select"><select value={reqForm.category} onChange={e => setReqForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{({ 'Pre-OJT': 'Before OJT', Ongoing: 'During OJT', 'Post-OJT': 'After OJT' })[c] || c}</option>)}
                  </select><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></label>
                <label className="arq-field"><span>Deadline <em>(optional)</em></span>
                  <input type="date" value={reqForm.deadline} onChange={e => setReqForm(f => ({ ...f, deadline: e.target.value }))} /></label>
              </div>
              <label className="arq-field"><span>Submission link <em>(optional)</em></span>
                <input type="url" placeholder="https://drive.google.com/drive/folders/…" value={reqForm.submissionLink || ''} onChange={e => setReqForm(f => ({ ...f, submissionLink: e.target.value }))} />
                <small className="arq-hint">Students open this link to submit instead of uploading in PATHWAY.</small></label>
            </div>
            <div className="arq-foot">
              <button type="button" className="arq-btn" onClick={() => setReqModal(null)}>Cancel</button>
              <button type="button" className="arq-btn arq-primary" onClick={handleAddRequirement} disabled={saving || !reqForm.label.trim()}>{saving ? 'Adding…' : 'Add requirement'}</button>
            </div>
          </div>
        </div>
      , document.body)}

      <AlertDialog
        open={Boolean(deleteConfirm)}
        title="Delete requirement from checklist?"
        description={deleteConfirm ? `“${deleteConfirm.label}” will be removed from ${selected?.name || 'this section'} for future submissions. Existing student records are preserved.` : ''}
        confirmLabel="Delete requirement"
        busy={saving}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => handleDeleteRequirement(deleteConfirm.id)}
      />
    </div>
  );
}

export function UnassignedStudents({ sectionId, department, onAssign }) {
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', department), where('sectionId', '==', '')));
        setUnassigned(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [sectionId, department]);

  const assign = async (studentId) => {
    try {
      await adminRequest('/coordinator/assign-student', {
        method: 'POST', body: JSON.stringify({ studentId, sectionId }),
      });
      setUnassigned(u => u.filter(s => s.id !== studentId));
      onAssign();
    } catch (error) {
      showNotice(error.message || 'Unable to assign this student.');
    }
  };

  const unassignedPage = useRecordPage([...unassigned].sort(compareStudents), sectionId);
  if (loading) return <InlineSkeleton label="Loading unassigned students" />;
  if (unassigned.length === 0) return <div style={{ color: '#000000', fontSize: 13, padding: 12 }}>No unassigned students found.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RecordPagination pagination={unassignedPage} label="Unassigned students" />
      {unassignedPage.items.map(st => (
        <div key={st.id} style={t.unassignedRow}>
          <div>
            <div style={t.studentName}>{personName(st)}</div>
            <div style={t.studentInfo}>ID {st.idNumber || 'not provided'}</div>
          </div>
          <button style={t.assignBtn} onClick={() => assign(st.id)}>
            + Assign to Section
          </button>
        </div>
      ))}
    </div>
  );
}

const t = {
  page: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.slate50,
  },
  left: {
    width: 280,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  leftHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  searchWrap: {
    padding: '12px 16px 0',
    backgroundColor: COLORS.white,
  },
  leftTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  leftCount: {
    fontSize: 11,
    color: '#000000',
    fontWeight: 700,
  },
  addBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '7px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  secList: {
    flex: 1,
    overflowY: 'auto',
  },
  secCard: {
    padding: '14px 18px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secCardActive: {
    backgroundColor: COLORS.sky50,
  },
  secMainClick: {
    flex: 1,
    cursor: 'pointer',
  },
  secName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  secInfo: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  secHoursBadge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 800,
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    padding: '2px 7px',
    borderRadius: THEME.radius.sm,
    marginTop: 6,
    border: `1px solid ${COLORS.yellow300}`,
  },
  configBtn: {
    background: 'none',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    cursor: 'pointer',
    fontSize: 14,
    padding: '6px 8px',
    backgroundColor: COLORS.white,
  },
  right: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
  },
  emptyDetail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 80,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  emptySub: {
    fontSize: 13,
    color: '#000000',
    maxWidth: 380,
    lineHeight: 1.5,
  },
  detailHeader: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    marginBottom: 24,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    boxShadow: THEME.shadows.xs,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  detailSubRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontSize: 13,
    color: '#000000',
    fontWeight: 600,
    flexWrap: 'wrap',
  },
  gcLink: {
    color: '#000000',
    fontWeight: 800,
    textDecoration: 'none',
    backgroundColor: COLORS.yellow100,
    padding: '3px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow300}`,
  },
  viewToggle: {
    display: 'flex',
    gap: 8,
  },
  toggleBtn: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    borderColor: COLORS.sky600,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  viewContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 900,
  },
  subHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: 'normal',
    margin: 0,
  },
  studentCountText: {
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
  },
  studentsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  studentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
  },
  studentLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    color: '#000000',
    fontWeight: 800,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${COLORS.sky300}`,
  },
  studentName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  studentInfo: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  pill: {
    fontSize: 11,
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
  },
  unassignedSection: {
    marginTop: 20,
    padding: 20,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  unassignedRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: COLORS.slate50,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate200}`,
  },
  assignBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
  },
  reqHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    flexWrap: 'wrap',
    gap: 12,
  },
  reqSubText: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#000000',
  },
  addReqBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
  },
  catBlock: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 14,
  },
  reqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  reqRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '12px 16px',
  },
  reqLeft: {
    flex: 1,
  },
  reqLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  deadlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deadlineLabel: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 700,
  },
  dateInput: {
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    padding: '4px 8px',
    fontSize: 12,
    color: '#000000',
    fontFamily: THEME.fonts.main,
    backgroundColor: COLORS.white,
  },
  deadlineBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: THEME.radius.full,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: '6px',
  },
  emptyCard: {
    padding: 28,
    textAlign: 'center',
    color: '#000000',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate200}`,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    padding: 24,
    textAlign: 'center',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.xl,
    padding: 32,
    width: '100%',
    maxWidth: 480,
    boxShadow: THEME.shadows.xl,
    border: `1px solid ${COLORS.slate300}`,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
  },
  select: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
  },
  modalBtns: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '12px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.white,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '12px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 12,
    color: '#000000',
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
