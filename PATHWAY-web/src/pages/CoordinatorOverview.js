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
  const pendingTotal = tasks.reduce((sum, task) => sum + (task[3] || 0), 0);
  return <section className="coordinator-overview cdash" aria-label="Section overview">
    <header className="cdash-hero">
      <div>
        <p className="cdash-eyebrow">Section overview</p>
        <h2>{section.name || 'Your section'}</h2>
        <p className="cdash-hero-meta">
          <span><Icon name="users" size={15} /> {students.length} {students.length === 1 ? 'student' : 'students'}</span>
          {section.hoursRequired ? <span><Icon name="clock" size={15} /> {section.hoursRequired} required hours</span> : null}
          <span role="status"><Icon name="refresh" size={15} /> {summary.incomplete ? 'Last refresh attempt' : 'Counts updated'} <time dateTime={summary.checkedAt.toISOString()}>{summary.checkedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></span>
        </p>
      </div>
      <div className="cdash-hero-side">
        <div className="cdash-hero-pending" data-zero={pendingTotal === 0}><strong>{pendingTotal}</strong><span>{pendingTotal === 1 ? 'item needs you' : 'items need you'}</span></div>
        <button type="button" className="cdash-button" onClick={() => load()}><Icon name="refresh" size={16} /> Refresh</button>
      </div>
    </header>
    <SectionCharts students={students} section={section}>
    <section className="cdash-card cdash-queue" aria-labelledby="overview-attention-title">
      <header className="cdash-card-head">
        <div><h2 id="overview-attention-title">Needs attention</h2><p>Tasks waiting for your review.</p></div>
      </header>
      {summary.incomplete && <PortalError message="Some counts could not load." onRetry={() => load()} />}
      {!summary.incomplete && tasks.every(([, , , count]) => count === 0) && <p className="cdash-caught-up"><Icon name="check" size={16} /> You’re caught up for this section.</p>}
      <div className="cdash-task-list coordinator-attention-grid">
        {[...tasks].sort((a, b) => Number(b[3] > 0) - Number(a[3] > 0)).map(([page, view, label, count, unit, icon]) =>
          <button key={view} type="button" className="cdash-task" data-pending={count > 0} onClick={() => onOpen(page, view, summary.pendingStudentIds)}>
            <span className="cdash-task-icon"><Icon name={icon} size={18} /></span>
            <span className="cdash-task-label coordinator-queue-label">{label}</span>
            <strong data-unavailable={count == null}>{count == null ? 'Unavailable' : count}
              {count != null && <span className="sr-only"> {count === 1 ? { students: 'student', requests: 'request', entries: 'entry' }[unit] : unit}</span>}
            </strong>
            <Icon name="chevronRight" size={16} />
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
  const colors = ['#e2e8f0', '#93c5fd', '#3b82f6', '#16a34a'];
  let start = 0;
  const segments = counts.flatMap((count, index) => {
    if (!count) return [];
    const end = start + count;
    const segment = `${colors[index]} ${100 * start / tracked}% ${100 * end / tracked}%`;
    start = end;
    return [segment];
  });
  const labels = ['0%', 'Above 0%, below 50%', '50% to below 100%', '100%+'];
  const pct = count => (total ? Math.round(100 * count / total) : 0);
  const metrics = [
    ['Students in section', total, 'users', 'blue', null],
    ['Requirements approved', milestones[0][1], 'clipboard', 'indigo', pct(milestones[0][1])],
    ['Placements assigned', milestones[1][1], 'building', 'teal', pct(milestones[1][1])],
    ['Hours target met', counts[3], 'clock', 'green', pct(counts[3])],
  ];
  return <div className="cdash-body">
    <dl className="cdash-metrics" aria-label="Section totals">
      {metrics.map(([label, count, icon, tone, percent]) => <div key={label} className="cdash-metric">
        <dt><span className="cdash-metric-icon" data-tone={tone}><Icon name={icon} size={20} /></span>{label}</dt>
        <dd className="cdash-metric-value">{count}{percent != null && total > 0 && <span> of {total}</span>}</dd>
        {percent != null && <dd className="cdash-metric-bar" aria-hidden="true"><span style={{ width: percent + '%' }} data-tone={tone} /></dd>}
        <dd className="cdash-metric-note">{percent == null ? 'On your section roster' : total ? percent + '% of the section' : 'No students yet'}</dd>
      </div>)}
    </dl>
    <div className="cdash-columns">
      {children}
      <section className="cdash-card cdash-hours" aria-labelledby="section-hours-title">
        <header className="cdash-card-head"><div><h2 id="section-hours-title">How close students are to their required hours</h2><p>Grouped by progress toward each student’s hours target.</p></div></header>
        {total === missingTargets ? <p className="cdash-empty">{total ? 'Required internship hours haven’t been set for this section.' : 'No students in this section yet.'}</p> :
          <div className="cdash-hours-body">
            <div className="cdash-donut" aria-hidden="true" style={{ background: 'conic-gradient(' + segments.join(', ') + ')' }}>
              <div><strong>{tracked}</strong><span>with a target</span></div>
            </div>
            <ul className="cdash-legend">
              {counts.map((count, index) => <li key={labels[index]}>
                <span className="cdash-swatch" aria-hidden="true" style={{ background: colors[index] }} />
                <span className="cdash-legend-label">{labels[index]}</span>
                <strong>{count}<span className="sr-only"> {count === 1 ? 'student' : 'students'} at</span></strong>
                <span className="sr-only">{' '}{labels[index]}</span>
              </li>)}
            </ul>
          </div>}
        {missingTargets > 0 && total !== missingTargets && <p className="cdash-note">{missingTargets} {missingTargets === 1 ? 'student has' : 'students have'} no hours target and are excluded from this chart.</p>}
      </section>
    </div>
    <section className="cdash-card cdash-journey" aria-labelledby="section-milestones-title">
      <header className="cdash-card-head"><div><h2 id="section-milestones-title">Student progress by step</h2><p>Students who reached each step of the OJT journey.</p></div></header>
      {total === 0 ? <p className="cdash-empty">No students in this section yet.</p> :
        <ol className="cdash-steps">
          {milestones.map(([label, count], index) => <li key={label}>
            <span className="cdash-step-num" aria-hidden="true">{index + 1}</span>
            <span className="cdash-step-label">{label}</span>
            <strong>{count} <span>of {total}</span></strong>
            <span className="cdash-step-bar" aria-hidden="true"><span style={{ width: pct(count) + '%' }} /></span>
          </li>)}
        </ol>}
    </section>
  </div>;
}
