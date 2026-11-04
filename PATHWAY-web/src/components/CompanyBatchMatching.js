import { useState } from 'react';
import { adminRequest } from '../adminApi';

const endpoint = '/coordinator/company-matching';
const studentName = student => [student.firstName, student.lastName].filter(Boolean).join(' ') || student.name || student.id;

export default function CompanyBatchMatching({ sectionId, students, onConfirmed }) {
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [choices, setChoices] = useState({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const candidates = students.filter(student => student.accountApproved === true && student.placementStatus !== 'approved'
    && !student.companyId && !student.placementProposalId && !student.endorsementId && student.clearanceStatus !== 'cleared'
    && !['inactive', 'disabled', 'rejected'].includes(student.status));
  const assignments = Object.entries(choices).filter(([, companyId]) => companyId)
    .map(([studentId, companyId]) => ({ studentId, companyId }));
  const overCapacity = preview?.companies.some(company =>
    assignments.filter(row => row.companyId === company.id).length > company.availableSlots);

  async function generate() {
    setBusy(true);
    setMessage('');
    setPreview(null);
    try {
      const result = await adminRequest(endpoint + '/preview', {
        method: 'POST', body: JSON.stringify({ sectionId, studentIds: selected }),
      });
      setChoices(Object.fromEntries(result.rows.map(row => [row.studentId, row.companyId || ''])));
      setPreview(result);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function confirm() {
    setBusy(true);
    setMessage('');
    try {
      const result = await adminRequest(endpoint + '/' + encodeURIComponent(preview.planId) + '/confirm', {
        method: 'POST', body: JSON.stringify({ assignments, startDate, endDate }),
      });
      setPreview(null);
      setSelected([]);
      setChoices({});
      setMessage(result.assignedCount + ' placement(s) confirmed. Check the endorsement queue for paperwork.');
      await onConfirmed();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <details className="placement-batch">
    <summary>Match students to companies</summary>
    <p>Choose up to 40 students. Only active companies with confirmed slots and a matching course code appear.</p>
    <fieldset disabled={busy}>
      <legend>Unplaced students ({selected.length}/40 selected)</legend>
      {!candidates.length && <p>No eligible students in this section.</p>}
      <div className="placement-batch-students">
        {candidates.map(student => <label key={student.id}>
          <input type="checkbox" checked={selected.includes(student.id)}
            disabled={selected.length >= 40 && !selected.includes(student.id)}
            onChange={event => {
              const checked = event.target.checked;
              setSelected(previous => checked ? [...previous, student.id] : previous.filter(id => id !== student.id));
              setPreview(null);
              setMessage('');
            }} /> {studentName(student)}
        </label>)}
      </div>
      <button type="button" className="placement-refresh" disabled={!selected.length} onClick={generate}>Generate suggestions</button>
    </fieldset>
    {preview && <fieldset disabled={busy}>
      <legend>Review official assignments</legend>
      <div className="placement-batch-rows">
        {preview.rows.map(row => <label key={row.studentId}>
          <strong>{row.studentName}</strong>
          <select value={choices[row.studentId]} onChange={event => {
            const companyId = event.target.value;
            setChoices(previous => ({ ...previous, [row.studentId]: companyId }));
          }}>
            <option value="">Leave unassigned</option>
            {preview.companies.map(company => <option value={company.id} key={company.id} disabled={!company.availableSlots}>
              {company.name} ({company.availableSlots} available)
            </option>)}
          </select>
          <small>{row.reason || row.preferenceSummary}</small>
        </label>)}
      </div>
      {preview.skipped.map(row => <p key={row.studentId}>{studentName(students.find(student => student.id === row.studentId) || { id: row.studentId })}: {row.reason}</p>)}
      {overCapacity && <p role="alert">Choose fewer students for a company that exceeds its available slots.</p>}
      <div className="placement-batch-rows">
        <label>Internship start date <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
        <label>Internship end date <input type="date" min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      </div>
      <p>Confirmation creates official placements and endorsement paperwork records and notifies the selected students.</p>
      <button type="button" className="placement-refresh" disabled={!assignments.length || overCapacity || !startDate || !endDate || startDate > endDate} onClick={confirm}>Confirm {assignments.length} assignment(s)</button>
    </fieldset>}
    {busy && <p role="status">Working…</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
