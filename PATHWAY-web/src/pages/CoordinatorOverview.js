import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { canAssignPlacement, isReadyForClearance } from '../coordinatorOverviewData';
import { PageSkeleton } from '../components/LoadingSkeleton';
import { PortalEmpty, PortalError } from '../components/PortalStates';
import Icon from '../components/Icons';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import './CoordinatorOverview.css';

async function countPendingJournals(students, isCurrent) {
  const pendingStudentIds = [];
  let journalCount = 0;
  for (let offset = 0; offset < students.length && isCurrent(); offset += 10) {
    const batch = students.slice(offset, offset + 10);
    const counts = await Promise.all(batch.map(async student => {
      const result = await getCountFromServer(query(collection(db, 'users', student.id, 'logbook'), where('status', '==', 'pending')));
      return result.data().count;
    }));
    counts.forEach((count, index) => {
      journalCount += count;
      if (count > 0) pendingStudentIds.push(batch[index].id);
    });
  }
  return { journalCount, pendingStudentIds };
}

export default function CoordinatorOverview({ section, students, requirementsCount, onOpen }) {
  const [summary, setSummary] = useState(null);
  const loadVersion = useRef(0);
  const studentsRef = useRef(students);
  studentsRef.current = students;
  const load = useCallback(async ({ isCurrent = () => true } = {}) => {
    if (!section) return;
    const version = ++loadVersion.current;
    const current = () => version === loadVersion.current && isCurrent();
    const roster = studentsRef.current;
    const [placements, journals, evaluations] = await Promise.allSettled([
      getDocs(query(collection(db, 'companyProposals'), where('sectionId', '==', section.id),
        where('department', '==', section.department), where('status', '==', 'pending_review'))),
      countPendingJournals(roster, current),
      adminRequest('/coordinator-evaluations'),
    ]);
    if (!current()) return;
    const pendingStudents = new Set(placements.value?.docs.map(item => item.data().studentId));
    const evaluatedStudents = new Set((evaluations.value?.evaluations || []).filter(item => item.submitted).map(item => item.studentId));
    setSummary({
      placementCount: placements.value?.size,
      waitingCount: placements.status === 'fulfilled' ? roster.filter(student => canAssignPlacement(student, pendingStudents)).length : undefined,
      journalCount: journals.value?.journalCount,
      pendingStudentIds: journals.value?.pendingStudentIds,
      clearanceCount: evaluations.status === 'fulfilled' ? roster.filter(student =>
        student.clearanceStatus !== 'cleared' && isReadyForClearance(student, section, evaluatedStudents)).length : undefined,
      incomplete: [placements, journals, evaluations].some(result => result.status === 'rejected'),
    });
  }, [section]);

  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);
  usePortalAutoRefresh(load, { enabled: !!section && !!summary, scope: section?.id, intervalMs: 60000 });

  if (!section) return <PortalEmpty title="No section assigned" description="Your overview will appear when a section is assigned to you." />;
  if (!summary) return <PageSkeleton label="Loading overview" />;
  const tasks = [
    ['requirements', 'requirements', 'Requirements awaiting review', requirementsCount, 'students'],
    ['placements', 'assign', 'Students waiting for a company assignment', summary.waitingCount, 'students'],
    ['placements', 'requests', 'Placement requests awaiting a decision', summary.placementCount, 'requests'],
    ['logbook', 'journals', 'Logbooks awaiting review', summary.journalCount, 'entries'],
    ['clearance', 'ready', 'Students ready for clearance', summary.clearanceCount, 'students'],
  ];
  return <section className="coordinator-overview" aria-labelledby="overview-attention-title">
    <div className="coordinator-overview-heading">
      <h2 id="overview-attention-title">Needs attention</h2>
      <button type="button" className="portal-secondary" onClick={() => load()}>Refresh counts</button>
    </div>
    {summary.incomplete && <PortalError message="Some counts could not load." onRetry={() => load()} />}
    {!summary.incomplete && tasks.every(([, , , count]) => count === 0) && <p>You’re caught up for this section.</p>}
    <ul>
      {tasks.map(([page, view, label, count, unit]) => <li key={view}>
        <button type="button" onClick={() => onOpen(page, view, summary.pendingStudentIds)}>
          <span>{label}</span>
          <span className="overview-task-count" data-zero={count === 0}>{count == null ? 'Unavailable' : count}
            {count != null && <span className="sr-only"> {count === 1 ? { students: 'student', requests: 'request', entries: 'entry' }[unit] : unit}</span>}
          </span>
          <Icon name="chevronRight" size={16} />
        </button>
      </li>)}
    </ul>
  </section>;
}
