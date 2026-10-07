import { requirementProgress } from './requirementProgress';

const statuses = { approved: 'Approved', submitted: 'Pending review', rejected: 'Rejected', not_submitted: 'Not submitted' };

export function sectionExportRows(section, students, checklist) {
  const sorted = [...students].sort((a, b) => `${a.lastName || ''} ${a.firstName || ''}`.localeCompare(`${b.lastName || ''} ${b.firstName || ''}`));
  const summary = sorted.map(student => {
    const progress = requirementProgress(student.requirements, checklist);
    return [String(student.idNumber || ''), String(student.username || ''), student.firstName || '', student.lastName || '', section.name || '', section.department || '', student.accountApproved ? 'Approved' : 'Not approved', progress.approved, progress.total, progress.total ? progress.approved / progress.total : null,
      ...checklist.map(item => statuses[student.requirements?.[item.id]?.status] || 'Not submitted')];
  });
  const details = sorted.flatMap(student => checklist.map(item => {
    const record = student.requirements?.[item.id] || {};
    return [String(student.idNumber || ''), `${student.firstName || ''} ${student.lastName || ''}`.trim(), item.category || '', item.label || item.id, statuses[record.status] || 'Not submitted', item.deadline || '', record.submittedAt || '', record.reviewedAt || '', record.status === 'rejected' ? record.rejectionReason || '' : ''];
  }));
  return { summary, details };
}

export async function buildSectionWorkbook(section, students, checklist) {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PATHWAY';
  workbook.created = new Date();
  const rows = sectionExportRows(section, students, checklist);
  const summary = workbook.addWorksheet('Student summary');
  const details = workbook.addWorksheet('Requirements');
  const info = workbook.addWorksheet('Export information');
  summary.addRow(['Student ID', 'Username', 'First name', 'Last name', 'Section', 'Department', 'Account approval', 'Approved requirements', 'Total requirements', 'Requirements approved',
    ...checklist.map(item => item.label || item.name || item.id)]);
  summary.addRows(rows.summary);
  summary.getColumn(1).numFmt = '@';
  summary.getColumn(10).numFmt = '0%';
  details.addRow(['Student ID', 'Student name', 'Phase', 'Requirement', 'Status', 'Deadline', 'Submitted at', 'Reviewed at', 'Rejection remarks']);
  details.addRows(rows.details);
  details.getColumn(1).numFmt = '@';
  info.addRows([
    ['Field', 'Value'], ['Section', section.name || ''], ['Department', section.department || ''],
    ['Exported at (UTC)', new Date().toISOString()], ['Students', students.length],
    ['Percentage definition', 'Approved requirements divided by the section checklist total. Pending and rejected items do not count.'],
    ['Empty checklist', 'Percentage is blank when no requirements are configured.'],
    ['Scope', 'All students in the selected section, regardless of screen search filters.'],
    ['Source', 'PATHWAY section student records and configured requirements.'],
    ['Privacy', 'Passwords, authentication tokens, and private attachment links are excluded.'],
  ]);
  for (const sheet of [summary, details, info]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075FC9' } };
    sheet.getRow(1).height = 32;
    sheet.columns.forEach(column => { column.width = 24; });
    sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  }
  details.getColumn(4).width = 32;
  summary.getRow(1).height = 48;
  checklist.forEach((item, index) => { summary.getColumn(11 + index).width = 30; });
  summary.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
  details.getColumn(9).width = 50;
  info.getColumn(2).width = 100;
  return workbook;
}

export async function downloadSectionExcel(section, students, checklist) {
  const workbook = await buildSectionWorkbook(section, students, checklist);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  const name = String(section.name || 'section').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  link.download = `PATHWAY-${name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
