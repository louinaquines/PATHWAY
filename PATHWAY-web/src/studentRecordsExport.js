import personName from './personName';
import { phDate, phClock, stamp } from './excelKit';
const timestamp = value => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

export async function buildStudentRecordsWorkbook(student, section, attendance, journals) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PATHWAY';
  workbook.created = new Date();
  const name = personName(student);
  const identity = [String(student.idNumber || ''), name, section?.name || ''];
  const punches = workbook.addWorksheet('Attendance');
  punches.addRow(['Student ID', 'Student name', 'Section', 'Date', 'Time in (PH)', 'Time out (PH)', 'Recorded hours', 'Status']);
  [...attendance].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).forEach(record => {
    punches.addRow([...identity, record.date || phDate(record.timeIn), phClock(record.timeIn), phClock(record.timeOut), record.timeOut && Number.isFinite(Number(record.hoursToday)) ? Number(record.hoursToday) : null, record.timeOut ? record.status || 'Completed' : 'In progress']);
  });
  punches.getColumn(7).numFmt = '0.00';
  const weekly = workbook.addWorksheet('Journals');
  weekly.addRow(['Student ID', 'Student name', 'Section', 'Entry', 'Reporting period', 'Reported hours', 'Status', 'Submitted date', 'Submitted time (PH)', 'Reviewed date', 'Reviewed time (PH)', 'Journal report', 'Original notes', 'Coordinator feedback']);
  [...journals].sort((a, b) => (a.weekNum || 0) - (b.weekNum || 0)).forEach(record => {
    weekly.addRow([...identity, record.frequency === 'daily' ? 'Daily' : record.weekNum ?? '', record.frequency === 'daily' ? record.periodStart || '' : record.weekRange || '', Number.isFinite(Number(record.hours)) ? Number(record.hours) : null, record.status || '', phDate(record.submittedAt || record.createdAt), phClock(record.submittedAt || record.createdAt), phDate(record.reviewedAt), phClock(record.reviewedAt), String(record.refined || ''), String(record.rawNotes || ''), String(record.reviewReason || '')]);
  });
  weekly.getColumn(6).numFmt = '0.00';
  const info = workbook.addWorksheet('Export information');
  info.addRows([['Field', 'Value'], ['Student ID', identity[0]], ['Student', name], ['Section', section?.name || ''], ['Date exported', phDate(workbook.created)], ['Time exported (Philippine time)', phClock(workbook.created)], ['Attendance records', attendance.length], ['Journal records', journals.length], ['Hours', 'Attendance hours and journal reported hours are separate; do not add them together. In-progress attendance has blank hours.'], ['Scope', 'Selected student only. Both sheets are exported regardless of the visible tab. Empty sheets contain headers.'], ['Privacy', 'Passwords, authentication tokens, private file links, and location coordinates are excluded.']]);
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } };
    sheet.columns.forEach(column => { column.width = 24; });
    sheet.getColumn(1).numFmt = '@';
    sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075FC9' } };
    sheet.getRow(1).height = 36;
  }
  [12, 13, 14].forEach(column => { weekly.getColumn(column).width = 60; });
  info.getColumn(2).width = 90;
  return workbook;
}

export async function downloadStudentRecordsExcel(student, section, attendance, journals) {
  const workbook = await buildStudentRecordsWorkbook(student, section, attendance, journals);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  const identifier = String(student.idNumber || student.id || 'student').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  link.download = `PATHWAY-${identifier}-attendance-journals-${stamp()}.xlsx`;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
