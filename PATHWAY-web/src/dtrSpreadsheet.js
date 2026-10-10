const fields = ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'];
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const value = cell => cell?.v == null ? '' : cell.v;
const label = cell => String(value(cell)).trim().toLowerCase().replace(/\s+/g, ' ');

export function form48FromWorkbook(workbook, utils) {
  if (!workbook?.SheetNames?.length || workbook.SheetNames.length > 10) throw new Error('Use a workbook with at most 10 sheets.');
  const candidates = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const range = utils.decode_range(sheet['!fullref'] || sheet['!ref']);
    if (range.e.r >= 150 || range.e.c >= 40) throw new Error('The workbook is too large for the Form 48 template.');
    const cell = (r, c) => sheet[utils.encode_cell({ r, c })];
    const headers = [];
    for (let r = 1; r <= range.e.r; r++) for (let c = 0; c <= range.e.c - 6; c++) {
      if (label(cell(r, c)) === 'day'
        && ['arrival', 'departure', 'arrival', 'departure', 'hours', 'minutes'].every((text, i) => label(cell(r, c + i + 1)) === text)
        && label(cell(r - 1, c + 1)).replace(/\./g, '') === 'am'
        && label(cell(r - 1, c + 3)).replace(/\./g, '') === 'pm') headers.push({ r, c });
    }
    if (!headers.length) continue;
    if (headers.length > 2) throw new Error('More than two Form 48 copies were found. Import one monthly form at a time.');
    const warnings = [];
    const copies = headers.map(({ r, c }, index) => {
      const rows = [];
      for (let day = 1; day <= 31; day++) {
        const dayCell = cell(r + day, c);
        if (dayCell?.f || Number(value(dayCell)) !== day) throw new Error(`Copy ${index + 1}: expected day ${day} in order.`);
        const row = { day };
        fields.forEach((field, i) => {
          const source = cell(r + day, c + i + 1);
          if (source?.f || source?.t === 'e') {
              row[field] = ''; row.needsReview = true; row.reviewFields = [...(row.reviewFields || []), field];
            warnings.push(`Copy ${index + 1}, day ${day}: a formula or error in ${field} was not imported.`);
          } else if (typeof value(source) === 'number') {
            const number = value(source);
            if (number < 0 || number >= 1 || !Number.isFinite(number)) {
              row[field] = String(number); row.needsReview = true; row.reviewFields = [...(row.reviewFields || []), field];
              warnings.push(`Copy ${index + 1}, day ${day}: check the numeric time.`);
            } else {
              const minutes = Math.round(number * 1440);
              row[field] = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
            }
          } else row[field] = String(value(source)).trim().slice(0, 80);
        });
        rows.push(row);
      }
      return rows;
    });
    const periods = new Set();
    // Only inspect text above the table, never infer a reporting month from cell formatting.
    for (let r = 0; r < Math.min(...headers.map(header => header.r)); r++) for (let c = 0; c <= range.e.c; c++) {
      const source = cell(r, c);
      if (source?.f) continue;
      const text = label(source);
      const match = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*(?:\d{1,2}\s*[-–]\s*\d{1,2}\s*,?\s*)?(\d{4})\b/);
      if (match && Number(match[2]) >= 1900 && Number(match[2]) <= 2200) periods.add(`${match[2]}-${String(months.indexOf(match[1]) + 1).padStart(2, '0')}`);
    }
    if (periods.size !== 1) warnings.push('Confirm the document month and year; the header is missing or inconsistent.');
    candidates.push({ sheetName: name, copies, month: periods.size === 1 ? [...periods][0] : '', warnings });
  }
  if (candidates.length !== 1) throw new Error(candidates.length ? 'Multiple DTR sheets found. Import one monthly form at a time.' : 'No supported Form 48 layout found. Use the supplied template or enter times manually.');
  return candidates[0];
}

export async function readDtrSpreadsheet(file) {
  if (!file || !/\.(xls|xlsx)$/i.test(file.name)) throw new Error('Choose an XLS or XLSX workbook.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a workbook up to 5 MB.');
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, i) => bytes[i] === byte);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (!ole && !zip) throw new Error('This file is not a supported Excel workbook.');
  let workbook;
  try { workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellHTML: false, cellStyles: false, sheetRows: 151 }); }
  catch { throw new Error('Could not read the workbook. It may be damaged or password protected.'); }
  return form48FromWorkbook(workbook, XLSX.utils);
}
