import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { canAssignPlacement, hoursProgressDistribution, isReadyForClearance } from '../coordinatorOverviewData';
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
      sectionId: section.id,
      checkedAt: new Date(),
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

  if (!section) return <PortalEmpty icon="section" title="No section yet"
    description="Your dashboard fills in once you have a section with students."
    steps={['Create a section in Sections & Students', 'Add or approve students in it', 'Come back here to see progress and alerts']}
    action={{ label: 'Go to Sections & Students', onClick: () => { window.location.assign('/coordinator/sections'); } }} />;
  if (summary?.sectionId !== section.id) return <PageSkeleton label="Loading overview" />;
  const tasks = [
    ['requirements', 'requirements', 'Review requirements', requirementsCount, 'students', 'clipboard'],
    ['placements', 'assign', 'Assign companies', summary.waitingCount, 'students', 'building'],
    ['placements', 'requests', 'Review placement requests', summary.placementCount, 'requests', 'clipboard'],
    ['logbook', 'journals', 'Review logbooks', summary.journalCount, 'entries', 'book'],
    ['clearance', 'ready', 'Clear students', summary.clearanceCount, 'students', 'check'],
  ];
  return <section className="coordinator-overview" aria-label="Section overview">
    <SectionCharts students={students} section={section}>
    <section className="coordinator-queue" aria-labelledby="overview-attention-title">
      <div className="coordinator-overview-heading">
        <h2 id="overview-attention-title">Needs attention</h2>
        <button type="button" className="portal-secondary" onClick={() => load()}><Icon name="refresh" size={15} /> Refresh</button>
      </div>
      <p role="status">
        {summary.incomplete ? 'Last refresh attempt' : 'Counts updated'} <time dateTime={summary.checkedAt.toISOString()}>{summary.checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
      </p>
      {summary.incomplete && <PortalError message="Some counts could not load." onRetry={() => load()} />}
      {!summary.incomplete && tasks.every(([, , , count]) => count === 0) && <p>You’re caught up for this section.</p>}
      <div className="coordinator-attention-grid">
        {[...tasks].sort((a, b) => Number(b[3] > 0) - Number(a[3] > 0)).map(([page, view, label, count, unit, icon]) =>
          <button key={view} type="button" data-pending={count > 0} onClick={() => onOpen(page, view, summary.pendingStudentIds)}>
            <span className="coordinator-queue-icon"><Icon name={icon} size={17} /></span>
            <span className="coordinator-queue-label">{label}</span>
            <strong data-unavailable={count == null}>{count == null ? 'Unavailable' : count}
              {count != null && <span className="sr-only"> {count === 1 ? { students: 'student', requests: 'request', entries: 'entry' }[unit] : unit}</span>}
            </strong>
            <Icon name="chevronRight" size={14} />
          </button>
        )}
      </div>
    </section>
    </SectionCharts>
  </section>;
}

function SectionCharts({ students, section, children }) {
  const total = students.length;
  const { counts, missingTargets } = hoursProgressDistribution(students, section.hoursRequired);
  const milestones = [
    ['Requirements approved', students.filter(student => student.requirementsStatus === 'approved').length],
    ['Placement assigned', students.filter(student => student.placementStatus === 'approved').length],
    ['Required hours met', counts[3]],
    ['Cleared', students.filter(student => student.clearanceStatus === 'cleared').length],
  ];
  const tracked = total - missingTargets;
  const colors = ['#dce6f0', '#9cc9ef', '#528fd0', '#223752'];
  let start = 0;
  const segments = counts.flatMap((count, index) => {
    if (!count) return [];
    const end = start + count;
    const segment = `${colors[index]} ${100 * start / tracked}% ${100 * end / tracked}%`;
    start = end;
    return [segment];
  });
  const labels = ['0%', 'Above 0%, below 50%', '50% to below 100%', '100%+'];
  return <div className="coordinator-dashboard-grid">
    <div className="coordinator-dashboard-main">
    <dl className="coordinator-metrics" aria-label="Section totals">
      {[
        ['Students in section', total, 'users', 'Section roster'],
        ['Assigned placements', milestones[1][1], 'building', 'Coordinator-confirmed'],
        ['Hours target met', counts[3], 'clock', 'Students at or above target'],
      ].map(([label, count, icon, detail]) => <div key={label} className="coordinator-metric">
        <dt><span className="coordinator-metric-icon"><Icon name={icon} size={17} /></span>{label}</dt>
        <dd>{count}</dd>
        <dd className="coordinator-metric-detail">{detail}</dd>
      </div>)}
    </dl>
    <section className="coordinator-chart coordinator-progress" aria-labelledby="section-milestones-title">
      <header>
        <h2 id="section-milestones-title">Student progress by step</h2>
      </header>
      <p>Students who reached each step.</p>
      {total === 0 ? <p className="coordinator-chart-empty">No students in this section yet.</p> :
        <ol className="coordinator-milestones">
          {milestones.map(([label, count], index) => <li key={label}>
            <span className="coordinator-milestone-marker" aria-hidden="true">Step {index + 1}</span>
            <span className="coordinator-milestone-label">{label}</span>
            <strong>{count} <span>of {total}</span></strong>
          </li>)}
        </ol>}
    </section>
    {children}
    </div>
    <div className="coordinator-chart-grid">
    <section className="coordinator-chart" aria-labelledby="section-hours-title">
      <header><h2 id="section-hours-title">How close students are to their required hours</h2><span className="coordinator-chart-unit">Students</span></header>
      <p>Students grouped by how much of their own hours target they’ve completed.</p>
      {total === missingTargets ? <p className="coordinator-chart-empty">{total ? 'Required internship hours haven’t been set for this section.' : 'No students in this section yet.'}</p> :
        <>
          <div className="coordinator-hours-donut" aria-hidden="true" style={{ background: 'conic-gradient(' + segments.join(', ') + ')' }}>
            <div><strong>{tracked}</strong><span>Students with a target</span></div>
          </div>
          <ul className="coordinator-hours-chart">
            {counts.map((count, index) => <li key={labels[index]}>
              <span className="coordinator-hours-swatch" aria-hidden="true" style={{ background: colors[index] }} />
              <strong>{count}<span className="sr-only"> {count === 1 ? 'student' : 'students'} at</span></strong>
              <span>{' '}{labels[index]}</span>
            </li>)}
          </ul>
        </>}
      {missingTargets > 0 && total !== missingTargets && <p className="coordinator-chart-note">{missingTargets} {missingTargets === 1 ? 'student has' : 'students have'} no hours target and are excluded from this chart.</p>}
    </section>
    </div>
  </div>;
}
