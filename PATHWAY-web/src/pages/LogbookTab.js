import personName from '../personName';
import { PortalEmpty } from '../components/PortalStates';
import { readPortalPage, readMatchingPortalPage } from '../portalRecordPages';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/LogbookTab.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortalFormDialog } from '../components/PortalStates';
import DtrReviewDialog from '../components/DtrReviewDialog';
import { collection, count, getAggregateFromServer, getCountFromServer, getDocs, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter, sum, where } from 'firebase/firestore';
import { createPortal } from 'react-dom';
import SectionPicker from '../components/SectionPicker';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { JournalEntriesSkeleton, LogbookRows } from '../components/PageSkeletons';
import AlertDialog from '../components/AlertDialog';
import SubmissionNotifications from '../components/SubmissionNotifications';
import JournalKeywordSettings from '../components/JournalKeywordSettings';
import JournalAiAnalysis from '../components/JournalAiAnalysis';
import './LogbookTab.css';
import './LogbookRedesign.css';
import { downloadStudentRecordsExcel } from '../studentRecordsExport';

const studentDisplayName = student => personName(student);

const rosterDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
});
const submittedJournalStatuses = new Set(['pending', 'submitted', 'approved', 'rejected']);

const manilaMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const shiftMonth = (month, delta) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1)); return d.toISOString().slice(0, 7); };
const monthLabel = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const entryMonth = entry => { if (entry?.periodStart) return String(entry.periodStart).slice(0, 7); const raw = entry?.createdAt; const d = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null; return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d).slice(0, 7) : ''; };

function recordDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function latestJournalDate(records, field, isCurrent) {
  // Read past drafts in small pages without downloading a student's journal history.
  const pageSize = 5;
  let cursor;
  while (isCurrent()) {
    const page = await getDocsFromServer(query(records, orderBy(field, 'desc'),
      ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)));
    for (const item of page.docs) {
      const data = item.data();
      if (!submittedJournalStatuses.has(data.status)) continue;
      const date = recordDate(data[field]);
      if (date) return { date, frequency: data.frequency === 'daily' ? 'daily' : data.frequency === 'weekly' ? 'weekly' : '' };
    }
    if (page.docs.length < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return null;
}

async function latestRosterRecords(studentId, isCurrent) {
  const attendance = collection(db, 'users', studentId, 'attendance');
  const journals = collection(db, 'users', studentId, 'logbook');
  const [punch, journal] = await Promise.allSettled([
    getDocsFromServer(query(attendance, orderBy('date', 'desc'), limit(1))).then(page => {
      const record = page.docs[0];
      return recordDate(record?.data().date || record?.id);
    }),
    Promise.all([
      latestJournalDate(journals, 'submittedAt', isCurrent),
      latestJournalDate(journals, 'createdAt', isCurrent),
    ]).then(([submitted, created]) => submitted && (!created || submitted.date > created.date) ? submitted : created),
  ]);
  return { attendance: attendanceLabel(punch), journals: journalLabel(journal) };
}

// Show where each student stands for the current period instead of a raw date.
const manilaDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
function weekStart(date) {
  const day = new Date(manilaDay(date) + 'T00:00:00');
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}
function attendanceLabel(result) {
  if (result.status === 'rejected') return { text: 'Unavailable' };
  if (!result.value) return { text: 'No attendance yet' };
  if (manilaDay(result.value) === manilaDay(new Date())) return { text: 'Present today', dated: true, tone: 'good' };
  return { text: 'Last: ' + rosterDateFormat.format(result.value).replace(/, \d{4}$/, ''), dated: true, tone: 'warn' };
}
function journalLabel(result) {
  if (result.status === 'rejected') return { text: 'Unavailable' };
  if (!result.value) return { text: 'No journal yet' };
  const { date, frequency } = result.value;
  if (frequency === 'daily') return manilaDay(date) === manilaDay(new Date())
    ? { text: 'Daily · Submitted today', dated: true, tone: 'good' }
    : { text: 'Daily · Last ' + rosterDateFormat.format(date).replace(/, \d{4}$/, ''), dated: true, tone: 'warn' };
  return weekStart(date) === weekStart(new Date())
    ? { text: 'Weekly · Submitted this week', dated: true, tone: 'good' }
    : { text: 'Weekly · Missing this week', dated: true, tone: 'warn' };
}

const RECORD_PAGE_SIZE = 8;

export default function LogbookTab({ coordinatorId, selectedSection: sharedSection, sections = [], onSectionChange, pendingStudentIds, openJournals = false }) {
  const [rosterPage, setRosterPage] = useState(null);
  const [rosterPaging, setRosterPaging] = useState(null);
  const [rosterRetry, setRosterRetry] = useState(0);
  const [rosterSearch, setRosterSearch] = useState('');
  const [entries, setEntries]                 = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState('');
  const entryRequest = useRef(0);
  const [journalCursors, setJournalCursors] = useState([null]);
  const [nextJournalCursor, setNextJournalCursor] = useState(null);
  const [journalStatus, setJournalStatus] = useState(Array.isArray(pendingStudentIds) ? 'pending' : '');
  const [decisionRevision, setDecisionRevision] = useState(0);
  const journalCursor = journalCursors.at(-1);
  const confirmHost = useRef(null);
  const selectedSection = sharedSection;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving]                   = useState(false);

  const [searchQuery, setSearchQuery]         = useState('');
  const [rejectConfirm, setRejectConfirm]     = useState(null);
  const [recordView, setRecordView] = useState(openJournals ? 'journals' : 'attendance');
  const [pendingOnly, setPendingOnly] = useState(Array.isArray(pendingStudentIds));
  const [attendance, setAttendance] = useState([]);
  const [attendanceCursors, setAttendanceCursors] = useState([null]);
  const [nextAttendanceCursor, setNextAttendanceCursor] = useState(null);
  const [attendanceRetry, setAttendanceRetry] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [recordMonth, setRecordMonth] = useState(manilaMonth);
  const attendanceCursor = attendanceCursors.at(-1);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [dtrStudent, setDtrStudent] = useState(null);
  useEffect(() => { setDtrStudent(null); }, [selectedSection?.id, selectedStudent?.id, recordView]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  useEffect(() => {
    let active = true; setAnalysis(null); setAnalysisError('');
    if (selectedStudent?.id && recordView === 'journals') adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/review-analysis`)
      .then(data => { if (active) setAnalysis(data); }).catch(failure => { if (active) setAnalysisError(failure.message); });
    return () => { active = false; };
  }, [selectedStudent?.id, decisionRevision, recordView]);
  const exportStudentRecords = async () => {
    if (!selectedStudent || !selectedSection || exporting) return;
    const student = selectedStudent;
    const section = selectedSection;
    setExporting(true);
    setExportError('');
    try {
      const [punches, journals] = await Promise.all([
        getDocs(collection(db, 'users', student.id, 'attendance')),
        getDocs(collection(db, 'users', student.id, 'logbook')),
      ]);
      await downloadStudentRecordsExcel(student, section, punches.docs.map(item => item.data()).filter(item => String(item.date || '').startsWith(recordMonth)), journals.docs.map(item => item.data()).filter(item => entryMonth(item) === recordMonth));
    } catch (_) { setExportError('Could not export student records. Check your connection and try again.'); }
    finally { setExporting(false); }
  };
  useEffect(() => {
    if (!selectedStudent?.id || recordView !== 'attendance') return;
    setAttendanceLoading(true);
    setAttendanceError('');
    setNextAttendanceCursor(null);
    const records = collection(db, 'users', selectedStudent.id, 'attendance');
    const pageQuery = query(records, where('date', '>=', recordMonth + '-01'), where('date', '<=', recordMonth + '-31'), orderBy('date', 'desc'), limit(62));
    return onSnapshot(pageQuery, snapshot => {
      setAttendance(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
      setNextAttendanceCursor(null);
      setAttendanceLoading(false);
    }, () => {
      setAttendanceError('Could not load attendance records.');
      setAttendanceLoading(false);
    });
  }, [selectedStudent?.id, recordView, recordMonth, attendanceRetry]);
  const formatPunch = value => {
    if (!value) return 'Not recorded';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const formatDay = value => { const d = new Date(`${value}T00:00:00Z`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
  const today = manilaToday();
  const attendanceStats = attendance.reduce((acc, record) => {
    acc.days += 1;
    if (record.timeOut) acc.hours += Number(record.hoursToday || 0);
    else if ((record.date || '') < today) acc.missing += 1;
    return acc;
  }, { days: 0, hours: 0, missing: 0 });
  const pendingCount = entries.filter(entry => entry.status === 'pending').length;
  const visibleEntries = journalStatus ? entries.filter(entry => entry.status === journalStatus) : entries;
  const rosterScopeKey = (selectedSection?.id || '') + ':' + pendingOnly + ':' + rosterSearch + ':' + rosterRetry;
  const rosterCursors = rosterPaging?.scope === rosterScopeKey ? rosterPaging.cursors : [null];
  const rosterCursor = rosterCursors.at(-1);
  const currentRoster = rosterPage?.scope === rosterScopeKey && rosterPage.cursor === rosterCursor ? rosterPage : null;
  const [rosterTotal, setRosterTotal] = useState(null);
  const studentCount = rosterTotal?.scope === rosterScopeKey ? rosterTotal.count : null;
  const pageNumber = rosterCursors.length;
  const hasMoreStudents = Boolean(currentRoster?.page?.hasMore);
  const pageTotal = studentCount != null ? Math.max(1, Math.ceil(studentCount / RECORD_PAGE_SIZE)) : null;
  const pageLabel = pageTotal != null
    ? 'Page ' + pageNumber + ' of ' + Math.max(pageTotal, pageNumber + Number(hasMoreStudents))
    : 'Page ' + pageNumber + (hasMoreStudents ? ' of at least ' + (pageNumber + 1) : currentRoster?.page ? ' of ' + pageNumber : '');
  const loading = !!selectedSection && !currentRoster;
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('lb-top-actions')); }, []);
  const [entryIndex, setEntryIndex] = useState(0);
  const [showAllDays, setShowAllDays] = useState(false);
  const [pickedDay, setPickedDay] = useState('');
  useEffect(() => { setEntryIndex(-1); setShowAllDays(false); setPickedDay(''); }, [selectedStudent?.id, recordMonth]);
  // Unread journals for every student in the section (one count per student).
  const [pendingMap, setPendingMap] = useState({ scope: '', map: {} });
  useEffect(() => {
    const sectionId = selectedSection?.id;
    if (!sectionId) return undefined;
    let active = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', sectionId)));
        const ids = snap.docs.map(item => item.id); const map = {};
        for (let i = 0; i < ids.length && active; i += 6) {
          await Promise.all(ids.slice(i, i + 6).map(async id => {
            try { map[id] = (await getCountFromServer(query(collection(db, 'users', id, 'logbook'), where('status', '==', 'pending')))).data().count; } catch (_) { map[id] = 0; }
          }));
        }
        if (active) setPendingMap({ scope: sectionId, map });
      } catch (_) { if (active) setPendingMap({ scope: sectionId, map: {} }); }
    })();
    return () => { active = false; };
  }, [selectedSection?.id, decisionRevision]);
  const pendingCounts = pendingMap.scope === selectedSection?.id ? pendingMap.map : {};
  const toReadIds = Array.isArray(pendingStudentIds) ? pendingStudentIds : Object.keys(pendingCounts).filter(id => pendingCounts[id] > 0);
  const toReadKey = [...toReadIds].sort().join(',');

  useEffect(() => {
    const timer = setTimeout(() => setRosterSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const sectionId = selectedSection?.id;
    if (!sectionId) return;
    let active = true;
    const scope = [where('role', '==', 'student'), where('sectionId', '==', sectionId)];
    const students = collection(db, 'users');
    const exactId = /^\d{5,24}$/.test(rosterSearch);
    const base = exactId
      ? query(students, ...scope, where('idNumber', '==', rosterSearch))
      : query(students, ...scope, orderBy('firstName'), orderBy('lastName'));
    const pendingIds = new Set(toReadIds);
    const requiresMatching = pendingOnly || (rosterSearch && !exactId);
    if (!requiresMatching && !rosterCursor) {
      getCountFromServer(base).then(snapshot => {
        if (active) setRosterTotal({ scope: rosterScopeKey, count: snapshot.data().count });
      }).catch(() => {});
    }
    const request = requiresMatching
      ? readMatchingPortalPage(base, rosterCursor, RECORD_PAGE_SIZE, student => (
        (!pendingOnly || pendingIds.has(student.id))
        && matchesCoordinatorSearch(rosterSearch, studentDisplayName(student), student.idNumber, selectedSection.name)
      ))
      : readPortalPage(base, rosterCursor, RECORD_PAGE_SIZE);
    request.then(page => ({ ...page, records: [...(page.records || [])].sort((a, b) => String(a.lastName || '').localeCompare(String(b.lastName || '')) || String(a.firstName || '').localeCompare(String(b.firstName || ''))) })).then(page => {
      if (active) setRosterPage({ scope: rosterScopeKey, cursor: rosterCursor, page });
    }).catch(() => {
      console.warn('Logbook roster query failed');
      if (active) setRosterPage({ scope: rosterScopeKey, cursor: rosterCursor, error: 'Could not load students.' });
    });
    return () => { active = false; };
  }, [selectedSection?.id, selectedSection?.name, rosterScopeKey, rosterCursor, rosterSearch, pendingOnly, toReadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedStudent(null);
    setEntries([]);
  }, [selectedSection?.id]);

  const fetchEntries = async (student, { silent = false, isCurrent = () => true } = {}) => {
    const request = ++entryRequest.current;
    const current = () => request === entryRequest.current && isCurrent();
    if (!silent) {
      setEntriesLoading(true);
      setEntriesError('');
    }
    try {
      const records = collection(db, 'users', student.id, 'logbook');
      const snap = await getDocs(query(records, where('periodStart', '>=', recordMonth + '-01'), where('periodStart', '<=', recordMonth + '-31'), orderBy('periodStart', 'desc'), limit(62)));
      if (!current()) return;
      setEntries(snap.docs.map(item => ({ ...item.data(), id: item.id })));
      setNextJournalCursor(null);
      setEntriesError('');
    } catch (e) {
      if (current()) setEntriesError('Could not load journal entries.');
    } finally {
      if (request === entryRequest.current) setEntriesLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedStudent || recordView !== 'journals') return;
    fetchEntries(selectedStudent);
    return () => { entryRequest.current++; };
  }, [selectedStudent, recordView, recordMonth]);

  const openRecords = (student, view) => {
    setAttendance([]);
    setAttendanceCursors([null]);
    setAttendanceDate('');
    setRecordMonth(manilaMonth());
    setNextAttendanceCursor(null);
    setAttendanceError('');
    setAttendanceLoading(view === 'attendance');
    setJournalCursors([null]);
    setNextJournalCursor(null);
    setJournalStatus(pendingOnly ? 'pending' : '');
    setSelectedStudent(student);
    setRecordView(view);
    setEntries([]);
    setExportError('');
    setEntriesLoading(view === 'journals');
  };

  const closeRecords = () => {
    if (saving || rejectConfirm) return;
    entryRequest.current++;
    setSelectedStudent(null);
    setEntries([]);
  };

  usePortalAutoRefresh(async options => {
    if (!selectedSection) return;

    if (options.isCurrent() && selectedStudent && recordView === 'journals') await fetchEntries(selectedStudent, options);
  }, { enabled: !loading && !saving, scope: (sharedSection?.id || '') + ':' + (selectedStudent?.id || '') });

  const [rejectReason, setRejectReason] = useState('');
  const handleAction = async (entryId, status, reason = '') => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/logbook/${encodeURIComponent(entryId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status, ...(status === 'rejected' ? { reason } : {}) }),
      });
      setEntries(prev => prev.map(e => e.id === entryId ? {
        ...e, status, reviewReason: status === 'rejected' ? reason : '',
      } : e));
      if (journalStatus && journalStatus !== status) await fetchEntries(selectedStudent);
      setDecisionRevision(value => value + 1);
      return true;
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Could not process this logbook review.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const STATUS_BG = {
    pending: COLORS.yellow100,
    approved: COLORS.emerald50,
    rejected: COLORS.rose50,
  };
  const STATUS_BORDER = {
    pending: COLORS.yellow300,
    approved: COLORS.emerald200,
    rejected: COLORS.rose200,
  };
  const STATUS_TEXT = {
    pending: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  const visibleStudents = currentRoster?.page?.records || [];
  const visibleStudentIds = JSON.stringify(visibleStudents.map(student => student.id));
  const rosterScope = (selectedSection?.id || '') + ':' + visibleStudentIds;
  const [rosterSummary, setRosterSummary] = useState(null);
  const loadRosterSummary = useCallback(async ({ isCurrent = () => true } = {}) => {
    const ids = JSON.parse(visibleStudentIds);
    const summaries = {};
    for (let i = 0; i < ids.length && isCurrent(); i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(async id => {
        summaries[id] = await latestRosterRecords(id, isCurrent);
      }));
    }
    if (isCurrent()) setRosterSummary({ scope: rosterScope, summaries });
  }, [visibleStudentIds, rosterScope]);

  useEffect(() => {
    let active = true;
    loadRosterSummary({ isCurrent: () => active });
    return () => { active = false; };
  }, [loadRosterSummary]);
  usePortalAutoRefresh(loadRosterSummary, {
    enabled: !loading && rosterSummary?.scope === rosterScope,
    scope: rosterScope, intervalMs: 60000,
  });



  // Days and hours this month for the students on this page (two cheap aggregate reads each).
  const [monthStats, setMonthStats] = useState({});
  useEffect(() => {
    const ids = JSON.parse(visibleStudentIds);
    if (!ids.length) return undefined;
    let active = true;
    (async () => {
      const next = {};
      for (let i = 0; i < ids.length && active; i += 4) {
        await Promise.all(ids.slice(i, i + 4).map(async id => {
          try {
            const agg = await getAggregateFromServer(query(collection(db, 'users', id, 'attendance'), where('date', '>=', recordMonth + '-01'), where('date', '<=', recordMonth + '-31')), { days: count(), hours: sum('hoursToday') });
            next[id] = { days: agg.data().days || 0, hours: Number(agg.data().hours || 0) };
          } catch (_) { next[id] = null; }
        }));
      }
      if (active) setMonthStats(prev => ({ ...prev, ...Object.fromEntries(Object.entries(next).map(([id, v]) => [id + ':' + recordMonth, v])) }));
    })();
    return () => { active = false; };
  }, [visibleStudentIds, recordMonth]);
  useEffect(() => {
    if (!selectedStudent && visibleStudents.length && !loading) setSelectedStudent(visibleStudents[0]);
  }, [visibleStudentIds, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const LATE_AFTER = '08:15';
  const punchHHMM = value => { const d = value?.toDate ? value.toDate() : value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : ''; };
  const shortPunch = value => { const d = value?.toDate ? value.toDate() : value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '—'; };
  const byDate = Object.fromEntries(attendance.map(record => [record.date || record.id, record]));
  const dayState = iso => {
    const record = byDate[iso];
    if (!record) return iso < today ? 'absent' : iso === today ? 'today' : 'future';
    if (!record.timeOut) return iso === today ? 'today' : 'missing';
    return punchHHMM(record.timeIn) > LATE_AFTER ? 'late' : 'ontime';
  };
  const [cy, cm] = recordMonth.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(cy, cm - 1, 1)).getUTCDay() + 6) % 7; // Mon = 0
  const firstRecord = attendance.map(r => r.date || r.id).sort()[0] || '';
  const calendarCells = [];
  if (firstWeekday <= 4) for (let i = 0; i < firstWeekday; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = (firstWeekday + d - 1) % 7;
    if (wd > 4) continue;
    const iso = `${recordMonth}-${String(d).padStart(2, '0')}`;
    let state = dayState(iso);
    if (state === 'absent' && (!firstRecord || iso < firstRecord)) state = 'none';
    calendarCells.push({ d, iso, state });
  }
  const legend = { ontime: 0, late: 0, missing: 0, absent: 0 };
  calendarCells.forEach(cell => { if (cell && legend[cell.state] != null) legend[cell.state] += 1; });
  const atWorkNow = byDate[today] && !byDate[today].timeOut;
  const monthDays = calendarCells.filter(Boolean).map(cell => cell.iso);
  const fallbackDay = monthDays.includes(today) ? today : (attendance.map(r => r.date || r.id).sort().at(-1) || monthDays.filter(iso => iso <= today).at(-1) || monthDays[0]);
  const activeDay = monthDays.includes(pickedDay) ? pickedDay : fallbackDay;
  const dayPos = monthDays.indexOf(activeDay);
  const stepDay = delta => { // eslint-disable-line no-unused-vars
    const next = monthDays[dayPos + delta];
    if (next) { setPickedDay(next); return; }
    if (delta < 0) setRecordMonth(month => shiftMonth(month, -1));
    else if (recordMonth < manilaMonth()) setRecordMonth(month => shiftMonth(month, 1));
  };
  const dayRecord = activeDay ? byDate[activeDay] : null;
  const sortedEntries = [...visibleEntries].sort((a, b) => String(a.periodStart || '').localeCompare(String(b.periodStart || '')));
  const defaultEntry = Math.max(0, sortedEntries.findIndex(entry => entry.status === 'pending'));
  const activeEntryIndex = entryIndex >= 0 && entryIndex < sortedEntries.length ? entryIndex : defaultEntry;
  const activeEntry = sortedEntries[activeEntryIndex];
  const entryDay = entry => { const d = new Date(`${entry.periodStart}T00:00:00Z`); return Number.isNaN(d.getTime()) ? { w: '', n: entry.periodStart || '—' } : { w: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), n: d.getUTCDate() }; };
  const studentPending = selectedStudent ? (pendingCounts[selectedStudent.id] ?? pendingCount) : 0;
  const rows = showAllDays ? attendance : attendance.slice(0, 4);
  const goNextPending = () => { const next = sortedEntries.findIndex((entry, i) => i > activeEntryIndex && entry.status === 'pending'); if (next >= 0) setEntryIndex(next); };
  const pageFirst = (pageNumber - 1) * RECORD_PAGE_SIZE + 1;
  const pageCount = studentCount != null ? Math.max(1, Math.ceil(studentCount / RECORD_PAGE_SIZE)) : pageNumber + Number(hasMoreStudents);

  const topControls = <>
    <div className="lb-month" role="group" aria-label="Month">
      <button type="button" aria-label="Previous month" disabled={saving} onClick={() => setRecordMonth(month => shiftMonth(month, -1))}><Icon name="chevronLeft" size={15} /></button>
      <span aria-live="polite">{monthLabel(recordMonth)}</span>
      <button type="button" aria-label="Next month" disabled={saving || recordMonth >= manilaMonth()} onClick={() => setRecordMonth(month => shiftMonth(month, 1))}><Icon name="chevronRight" size={15} /></button>
    </div>
    <SectionPicker sections={sections} selected={sharedSection} onChange={section => onSectionChange?.(section)} />
  </>;

  return (
    <div className="rq lb">
      {topHost && createPortal(topControls, topHost)}
      <div className="rq-list">
        <div className="rq-search-row">
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search students" placeholder="Find a student" />
          <SubmissionNotifications kind="logbook" coordinatorId={coordinatorId} section={selectedSection} onOpen={student => openRecords(student, 'journals')} />
        </div>
        <div className="rq-pills" role="group" aria-label="Filter students">
          <button type="button" aria-pressed={pendingOnly} onClick={() => { setPendingOnly(true); setRecordView('journals'); }}>Journals to read{toReadIds.length ? ` ${toReadIds.length}` : ''}</button>
          <button type="button" aria-pressed={!pendingOnly} onClick={() => setPendingOnly(false)}>All{studentCount != null ? ` ${studentCount}` : ''}</button>
        </div>
        <div className="rq-students">
          {!selectedSection && (sections.length === 0
            ? <PortalEmpty compact icon="section" title="No sections yet" description="Attendance and journals appear here once you have a section with students." />
            : <PortalEmpty compact icon="section" title="Choose a section" description="Pick a section at the top right." />)}
          {selectedSection && loading && <div className="logbook-skel" role="status" aria-label="Loading students"><LogbookRows /></div>}
          {currentRoster?.error && <div className="rq-empty" role="status"><strong>No students yet</strong>
            <span>Attendance and journals will appear here once students join {selectedSection?.name || 'this section'}.</span>
            <button type="button" className="rq-link" onClick={() => setRosterRetry(value => value + 1)}>Check again</button></div>}
          {!loading && !currentRoster?.error && selectedSection && !visibleStudents.length && <div className="rq-empty">{currentRoster?.page?.hasMore ? 'No matches on this page. Choose Next to continue.' : pendingOnly ? 'No journals waiting. You’re all caught up.' : 'No students match this view.'}</div>}
          {visibleStudents.map(student => {
            const name = studentDisplayName(student) || 'Student';
            const stats = monthStats[student.id + ':' + recordMonth];
            const toRead = pendingCounts[student.id] || 0;
            const summary = rosterSummary?.scope === rosterScope ? rosterSummary.summaries[student.id] : null;
            const sub = stats ? `${stats.days} day${stats.days === 1 ? '' : 's'} · ${Math.round(stats.hours * 10) / 10} hours` : selectedSection?.name;
            const tag = toRead ? [`${toRead} to read`, 'blue'] : summary?.attendance?.tone === 'good' ? ['At work today', 'green'] : stats && stats.days === 0 ? ['No attendance', 'mute'] : ['Up to date', 'mute'];
            return <button type="button" className="rq-student" key={student.id} aria-pressed={selectedStudent?.id === student.id} onClick={() => openRecords(student, recordView)}>
              <span className="rq-avatar" aria-hidden="true">{((student.firstName || name)[0] + (student.lastName || '')[0]).toUpperCase()}</span>
              <span className="rq-student-name"><strong>{name}</strong><small>{sub}</small></span>
              <span className="rq-student-tag" data-tone={tag[1]}>{tag[0]}</span>
            </button>;
          })}
        </div>
        {visibleStudents.length > 0 && <nav className="rq-pages" aria-label="Student pages">
          <span aria-live="polite">{pageFirst}–{pageFirst + visibleStudents.length - 1}{studentCount != null ? ` of ${studentCount}` : ''}</span>
          <button type="button" disabled={pageNumber === 1} onClick={() => setRosterPaging({ scope: rosterScopeKey, cursors: rosterCursors.slice(0, -1) })} aria-label="Previous page"><Icon name="chevronLeft" size={14} /></button>
          {[pageNumber - 1, pageNumber, pageNumber + 1].filter(n => n >= 1 && n <= pageCount).map(n => <button key={n} type="button" aria-current={n === pageNumber ? 'page' : undefined} disabled={n === pageNumber}
            onClick={() => n < pageNumber ? setRosterPaging({ scope: rosterScopeKey, cursors: rosterCursors.slice(0, -1) }) : setRosterPaging({ scope: rosterScopeKey, cursors: [...rosterCursors, currentRoster.page.cursor] })}>{n}</button>)}
          <button type="button" disabled={!hasMoreStudents} onClick={() => setRosterPaging({ scope: rosterScopeKey, cursors: [...rosterCursors, currentRoster.page.cursor] })} aria-label="Next page"><Icon name="chevronRight" size={14} /></button>
        </nav>}
      </div>

      <div className="rq-detail lb-detail">
        {!selectedStudent ? <PortalEmpty icon="user" title="Select a student" description="Choose a student on the left to see their attendance and journals." /> : <>
          <div className="rq-head">
            <div><h2>{personName(selectedStudent) || 'Student'}</h2>
              <p>{[selectedStudent.companyName || selectedStudent.company ? `Training at ${selectedStudent.companyName || selectedStudent.company}` : 'No company yet',
                selectedStudent.hoursRequired ? `${Math.round(Number(selectedStudent.hoursRendered || 0))} of ${selectedStudent.hoursRequired} hours` : null].filter(Boolean).join(' · ')}</p></div>
            <button type="button" className="rq-btn" disabled={exporting} aria-busy={exporting} onClick={exportStudentRecords}><Icon name="download" size={14} /> {exporting ? 'Exporting…' : 'Export this month'}</button>
          </div>
          <div className="rq-stages" role="tablist" aria-label="Record type" style={{ '--count': 3, '--index': recordView === 'journals' ? 1 : 0 }}>
            <span className="rq-stages-thumb" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={recordView === 'attendance'} onClick={() => setRecordView('attendance')}><i data-tone={attendanceStats.missing ? 'red' : 'mute'} aria-hidden="true" /><strong>Attendance</strong></button>
            <button type="button" role="tab" aria-selected={recordView === 'journals'} onClick={() => setRecordView('journals')}><i data-tone={studentPending ? 'blue' : 'mute'} aria-hidden="true" /><strong>Journals{studentPending ? ` · ${studentPending} to read` : ''}</strong></button>
            <button type="button" role="tab" aria-selected={false} onClick={() => setDtrStudent(selectedStudent)}><i data-tone="mute" aria-hidden="true" /><strong>Form 48 check</strong></button>
          </div>
          {exportError && <p role="alert" className="lb-alert">{exportError}</p>}
          {dtrStudent && <DtrReviewDialog key={dtrStudent.id} student={dtrStudent} onClose={() => setDtrStudent(null)} />}

          <div className="lb-body">
          {recordView === 'attendance' && <>
            {attendanceLoading && <div className="logbook-skel logbook-skel-att" role="status" aria-label="Loading attendance">{[0, 1, 2, 3, 4].map(key => <div key={key} className="logbook-skel-row"><span className="cdash-skel" style={{ width: 84, height: 12, borderRadius: 6 }} /><span className="cdash-skel" style={{ width: 70, height: 12, borderRadius: 6 }} /><span className="cdash-skel" style={{ width: 70, height: 12, borderRadius: 6 }} /></div>)}</div>}
            {attendanceError && <p role="alert" className="lb-alert">{attendanceError} <button type="button" className="rq-link" onClick={() => setAttendanceRetry(value => value + 1)}>Try again</button></p>}
            {!attendanceLoading && !attendanceError && <>
              <p className="lb-summary">{attendanceStats.days
                ? <>Came {attendanceStats.days} day{attendanceStats.days === 1 ? '' : 's'} this month and worked {attendanceStats.hours.toFixed(1)} hours.{attendanceStats.missing > 0 && <> {attendanceStats.missing} day{attendanceStats.missing === 1 ? ' has' : 's have'} no time-out.</>}</>
                : `No attendance in ${monthLabel(recordMonth)}.`}</p>
              <div className="lb-cal-month" role="group" aria-label="Calendar month">
                <button type="button" className="rq-icon" aria-label="Previous month" disabled={saving} onClick={() => setRecordMonth(month => shiftMonth(month, -1))}><Icon name="chevronLeft" size={15} /></button>
                <strong aria-live="polite">{monthLabel(recordMonth)}</strong>
                <button type="button" className="rq-icon" aria-label="Next month" disabled={saving || recordMonth >= manilaMonth()} onClick={() => setRecordMonth(month => shiftMonth(month, 1))}><Icon name="chevronRight" size={15} /></button>
              </div>
              <div className="lb-cal-wrap">
                <div className="lb-cal" role="grid" aria-label={`${monthLabel(recordMonth)} attendance`}>
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => <span key={day} className="lb-cal-head" role="columnheader">{day}</span>)}
                  {calendarCells.map((cell, i) => cell
                    ? <button type="button" key={cell.iso} role="gridcell" className="lb-cal-day" data-state={cell.state} aria-selected={cell.iso === activeDay} disabled={cell.state === 'future'} onClick={() => setPickedDay(cell.iso)}
                        title={{ ontime: 'Came on time', late: 'Came late', missing: 'No time-out', absent: 'Absent', today: 'Today', none: 'Before training', future: '' }[cell.state]}>{cell.d}</button>
                    : <span key={'e' + i} className="lb-cal-blank" />)}
                </div>
                <dl className="lb-legend">
                  <div><dt><i data-state="ontime" />Came on time</dt><dd>{legend.ontime} day{legend.ontime === 1 ? '' : 's'}</dd></div>
                  <div><dt><i data-state="late" />Came late</dt><dd>{legend.late} day{legend.late === 1 ? '' : 's'}</dd></div>
                  <div><dt><i data-state="missing" />No time-out</dt><dd>{legend.missing} day{legend.missing === 1 ? '' : 's'}</dd></div>
                  <div><dt><i data-state="absent" />Absent</dt><dd>{legend.absent} day{legend.absent === 1 ? '' : 's'}</dd></div>
                  <div><dt><i data-state="today" />Today</dt><dd>{atWorkNow ? 'At work now' : byDate[today] ? 'Done' : recordMonth === manilaMonth() ? 'Not in yet' : '—'}</dd></div>
                </dl>
              </div>
              {activeDay && <div className="lb-dayview">
                <div className="lb-daynav">
                  <strong aria-live="polite">{formatDay(activeDay)}{activeDay === today ? ' · today' : ''}</strong>
                  {attendance.length > 0 && <button type="button" className="rq-link lb-more" onClick={() => setShowAllDays(value => !value)}>{showAllDays ? 'Hide the month' : 'See the whole month'}</button>}
                </div>
                <div className="lb-table" role="table" aria-label="Attendance">
                  <div className="lb-tr lb-th" role="row"><span role="columnheader">Day</span><span role="columnheader">Time in</span><span role="columnheader">Time out</span><span role="columnheader">Hours</span></div>
                  {(showAllDays ? attendance : [dayRecord || { id: activeDay, date: activeDay, empty: true }]).map(record => {
                    const iso = record.date || record.id; const missing = !record.empty && !record.timeOut && iso < today; const now = !record.empty && !record.timeOut && iso === today;
                    return <div className="lb-tr" role="row" key={record.id} data-active={iso === activeDay || undefined}>
                      <span role="cell" className="lb-day">{formatDay(iso)}{iso === today ? ' · today' : ''}</span>
                      <span role="cell">{record.empty ? '—' : shortPunch(record.timeIn)}</span>
                      <span role="cell">{record.empty ? <b className="lb-chip" data-tone={iso < today && dayState(iso) === 'absent' ? 'red' : 'mute'}>{iso > today ? 'Not yet' : iso === today ? 'Not in yet' : 'No record'}</b> : missing ? <b className="lb-chip" data-tone="red">No time-out</b> : now ? 'At work now' : shortPunch(record.timeOut)}</span>
                      <span role="cell">{!record.empty && record.timeOut ? Number(record.hoursToday || 0).toFixed(1) : '—'}</span>
                    </div>;
                  })}
                </div>
              </div>}
            </>}
          </>}

          {recordView === 'journals' && <>
            {entriesLoading && <JournalEntriesSkeleton />}
            {entriesError && <p role="alert" className="lb-alert">{entriesError} <button type="button" className="rq-link" onClick={() => fetchEntries(selectedStudent)}>Try again</button></p>}
            {!entriesLoading && !entriesError && <>
              <div className="lb-journal-top">
                <p className="lb-summary">{entries.length
                  ? <>Wrote {entries.length} journal{entries.length === 1 ? '' : 's'} this month.{pendingCount > 0 && <> {pendingCount} {pendingCount === 1 ? 'is' : 'are'} waiting for you.</>}</>
                  : `No journals in ${monthLabel(recordMonth)}.`}</p>
                {entries.length > 0 && <div className="lb-mini-pills" role="group" aria-label="Journal status">
                  <button type="button" aria-pressed={!journalStatus} onClick={() => { setJournalStatus(''); setEntryIndex(-1); }}>All</button>
                  <button type="button" aria-pressed={journalStatus === 'pending'} onClick={() => { setJournalStatus('pending'); setEntryIndex(-1); }}>To read{pendingCount ? ` ${pendingCount}` : ''}</button>
                </div>}
              </div>
              {sortedEntries.length > 0 && <>
                <div className="lb-days" role="tablist" aria-label="Journal days">
                  {sortedEntries.map((entry, i) => { const day = entryDay(entry); return <button key={entry.id} type="button" role="tab" aria-selected={i === activeEntryIndex} data-status={entry.status} onClick={() => setEntryIndex(i)}>
                    <small>{day.w}</small><strong>{day.n}</strong></button>; })}
                </div>
                <div className="lb-legend-inline"><span><i data-status="approved" />Read</span><span><i data-status="pending" />Waiting for you</span><span><i data-status="rejected" />Sent back</span></div>
              </>}
              {analysis && <details className="lb-details"><summary>Journal check settings</summary><JournalKeywordSettings sectionId={selectedSection.id} keywords={analysis.keywords} onSaved={async () => {
                try { setAnalysis(await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/review-analysis`)); } catch (failure) { setAnalysisError(failure.message); }
              }} /></details>}
              {analysis?.missingWeeksBetweenSubmissions?.length > 0 && <aside className="lb-note"><strong>Weeks without a journal</strong> No entry between submitted weeks for: {analysis.missingWeeksBetweenSubmissions.join(', ')}.{analysis.truncated && ' Only the latest 100 entries were checked.'}</aside>}
              {activeEntry && <article className="lb-entry">
                <header>
                  <h3>{formatDay(activeEntry.periodStart || '') || 'Journal'}</h3>
                  <span className="lb-entry-meta">{activeEntry.hours ? `${activeEntry.hours} hrs` : ''}{activeEntry.frequency === 'weekly' && activeEntry.weekRange ? ` · ${activeEntry.weekRange}` : ''}</span>
                  <b className="lb-chip" data-tone={activeEntry.status === 'approved' ? 'green' : activeEntry.status === 'rejected' ? 'red' : 'amber'}>{activeEntry.status === 'approved' ? 'Read' : activeEntry.status === 'rejected' ? 'Sent back' : 'Waiting for you'}</b>
                  <span className="lb-entry-nav">Journal {activeEntryIndex + 1} of {sortedEntries.length}
                    <button type="button" className="rq-icon" aria-label="Previous journal" disabled={activeEntryIndex === 0} onClick={() => setEntryIndex(activeEntryIndex - 1)}><Icon name="chevronLeft" size={14} /></button>
                    <button type="button" className="rq-icon" aria-label="Next journal" disabled={activeEntryIndex >= sortedEntries.length - 1} onClick={() => setEntryIndex(activeEntryIndex + 1)}><Icon name="chevronRight" size={14} /></button>
                  </span>
                </header>
                <section><h4>{activeEntry.frequency === 'weekly' ? 'What I did this week' : 'What I did today'}</h4><p>{activeEntry.refined || activeEntry.rawNotes || 'No journal text.'}</p></section>
                {activeEntry.status === 'rejected' && activeEntry.reviewReason && <section className="lb-feedback"><h4>What you asked them to fix</h4><p>{activeEntry.reviewReason}</p></section>}
                <JournalAiAnalysis key={`${selectedStudent.id}:${activeEntry.id}`} studentId={selectedStudent.id} entryId={activeEntry.id} sourceText={activeEntry.rawNotes || activeEntry.refined} hours={activeEntry.hours} weekRange={activeEntry.weekRange} />
                {analysisError && <p className="lb-alert">Review checks unavailable: {analysisError}</p>}
                {analysis?.journals?.filter(item => item.id === activeEntry.id).map(item => <details key={item.id} className="lb-details"><summary>Automatic journal checks</summary>
                  {item.findings.map(finding => <p key={finding}>{finding}</p>)}
                  {!item.findings.length && <p>No structural warnings found. This is not an approval.</p>}
                  {item.competencies.map(skill => <p key={skill.name}>{skill.name}: matched words {skill.evidence.join(', ')}</p>)}
                  {item.sentimentCues.length > 0 && <p>Text cues: {item.sentimentCues.join(', ')}</p>}
                  <p>{item.limitation}</p>
                </details>)}
              </article>}
            </>}
          </>}
          </div>
          {recordView === 'journals' && activeEntry?.status === 'pending' && <div className="lb-actions">
            <input className="lb-note-input" aria-label={`Note for ${selectedStudent.firstName || 'the student'}`} placeholder={`Add a note for ${selectedStudent.firstName || 'the student'} (needed to ask for a redo)`} value={rejectReason} maxLength={1000} onChange={event => setRejectReason(event.target.value)} />
            <button type="button" className="rq-btn" disabled={saving} onClick={() => setRejectConfirm(activeEntry)}><Icon name="refresh" size={14} /> Ask to redo</button>
            <button type="button" className="rq-btn rq-primary" disabled={saving} onClick={async () => { if (await handleAction(activeEntry.id, 'approved')) goNextPending(); }}><Icon name="check" size={14} /> Mark as read</button>
          </div>}
        </>}
      </div>
      <div ref={confirmHost} />
      <AlertDialog
        portalTarget={confirmHost.current || undefined}
        open={Boolean(rejectConfirm)}
        title="Ask the student to redo this journal?"
        description="They will see your note and must edit the journal before sending it again."
        confirmLabel="Send back"
        busy={saving}
        confirmDisabled={!rejectReason.trim()}
        onCancel={() => setRejectConfirm(null)}
        onConfirm={async () => {
          const saved = await handleAction(rejectConfirm.id, 'rejected', rejectReason.trim());
          if (saved) { setRejectConfirm(null); setRejectReason(''); }
        }}
      >
        <label className="logbook-reject-reason">
          <span>Note for the student</span>
          <textarea rows={4} maxLength={1000} value={rejectReason} onChange={event => setRejectReason(event.target.value)}
            placeholder="e.g. Add what you did each day and your supervisor's name." autoFocus />
        </label>
      </AlertDialog>
    </div>
  );
}

const t = {
  entriesList: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    boxSizing: 'border-box',
  },
  entriesScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    backgroundColor: COLORS.white,
  },
  entryCard: {
    padding: 20,
    backgroundColor: COLORS.slate50,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
  },
  entryTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  entryWeek: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
  },
  entrySub: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  badge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
  },
  entryLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  entryText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 1.65,
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
  },
  actionRow: {
    display: 'flex',
    gap: 10,
    marginTop: 16,
  },
  approveBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '8px 18px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  rejectBtn: {
    backgroundColor: COLORS.rose50,
    color: '#000000',
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.md,
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
  },
};
