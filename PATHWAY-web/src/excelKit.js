// Shared look and download for every coordinator Excel export.
export const phTime = value => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true });
};
const asDate = value => { if (!value) return null; const d = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
export const phDate = value => { const d = asDate(value); return d ? d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit' }) : ''; };
export const phClock = value => { const d = asDate(value); return d ? d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : ''; };
export const PHASES = { 'Pre-OJT': 'Before OJT', Ongoing: 'During OJT', 'Post-OJT': 'After OJT' };
export const fileSafe = text => String(text || 'section').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'section';

export async function newWorkbook() {
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PATHWAY';
  workbook.created = new Date();
  return workbook;
}
export function styleSheet(sheet, { width = 24, idColumn = 1 } = {}) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: sheet.columnCount } };
  sheet.columns.forEach(column => { column.width = width; });
  if (idColumn) sheet.getColumn(idColumn).numFmt = '@';
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true }; });
  const head = sheet.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075FC9' } };
  head.height = 32;
}
export function addInfoSheet(workbook, rows) {
  const info = workbook.addWorksheet('Export information');
  info.addRows([['Field', 'Value'], ['Date exported', phDate(workbook.created)], ['Time exported (Philippine time)', phClock(workbook.created)], ...rows,
    ['Privacy', 'Passwords, authentication tokens and private file links are excluded.']]);
  styleSheet(info, { idColumn: 0 });
  info.getColumn(1).width = 28; info.getColumn(2).width = 100;
  return info;
}
export async function downloadWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = fileName;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
export const stamp = () => { const now = new Date(); return `${today()}_${now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }).replace(':', '')}`; };

// Adds "Date exported" and "Time exported" columns to every row of a data sheet.
export function addExportedColumns(sheet, when = new Date()) {
  const date = phDate(when), time = phClock(when);
  const c = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row, n) => { row.getCell(c + 1).value = n === 1 ? 'Date exported' : date; row.getCell(c + 2).value = n === 1 ? 'Time exported (PH)' : time; });
}
