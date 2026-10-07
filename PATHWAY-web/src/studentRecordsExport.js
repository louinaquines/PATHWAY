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
  const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
  const identity = [String(student.idNumber || ''), name, section?.name || ''];
  const punches = workbook.addWorksheet('Attendance');
  punches.addRow(['Student ID', 'Student name', 'Section', 'Date', 'Time in (Philippine time)', 'Time out (Philippine time)', 'Recorded hours', 'Status']);
  [...attendance].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).forEach(record => {
    punches.addRow([...identity, record.date || '', timestamp(record.timeIn), timestamp(record.timeOut), record.timeOut && Number.isFinite(Number(record.hoursToday)) ? Number(record.hoursToday) : null, record.timeOut ? record.status || 'Completed' : 'In progress']);
  });
  punches.getColumn(7).numFmt = '0.00';
  const weekly = workbook.addWorksheet('Weekly Journals');
  weekly.addRow(['Student ID', 'Student name', 'Section', 'Week', 'Week range', 'Reported hours', 'Status', 'Submitted / created (Philippine time)', 'Reviewed (Philippine time)', 'Weekly report', 'Original notes', 'Coordinator feedback']);
  [...journals].sort((a, b) => (a.weekNum || 0) - (b.weekNum || 0)).forEach(record => {
    weekly.addRow([...identity, record.weekNum ?? '', record.weekRange || '', Number.isFinite(Number(record.hours)) ? Number(record.hours) : null, record.status || '', timestamp(record.submittedAt || record.createdAt), timestamp(record.reviewedAt), String(record.refined || ''), String(record.rawNotes || ''), String(record.reviewReason || '')]);
  });
  weekly.getColumn(6).numFmt = '0.00';
  const info = workbook.addWorksheet('Export information');
  info.addRows([['Field', 'Value'], ['Student ID', identity[0]], ['Student', name], ['Section', section?.name || ''], ['Exported (Philippine time)', timestamp(workbook.created)], ['Attendance records', attendance.length], ['Weekly journal records', journals.length], ['Hours', 'Attendance hours and weekly reported hours are separate; do not add them together. In-progress attendance has blank hours.'], ['Scope', 'Selected student only. Both sheets are exported regardless of the visible tab. Empty sheets contain headers.'], ['Privacy', 'Passwords, authentication tokens, private file links, and location coordinates are excluded.']]);
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
  [10, 11, 12].forEach(column => { weekly.getColumn(column).width = 60; });
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
  link.download = `PATHWAY-${identifier}-attendance-journals.xlsx`;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
