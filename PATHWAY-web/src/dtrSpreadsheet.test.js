import { utils, read, write } from 'xlsx';
import { form48FromWorkbook, readDtrSpreadsheet } from './dtrSpreadsheet';

function fixture({ two = true, period = 'October 1-31, 2026' } = {}) {
  const grid = Array.from({ length: 44 }, () => []);
  grid[6][0] = period;
  for (const offset of two ? [0, 8] : [0]) {
    grid[10][offset + 1] = 'A.M.'; grid[10][offset + 3] = 'P.M.';
    ['DAY', 'Arrival', 'Departure', 'Arrival', 'Departure', 'Hours', 'Minutes'].forEach((value, i) => { grid[11][offset + i] = value; });
    for (let day = 1; day <= 31; day++) grid[11 + day][offset] = day;
    grid[12][offset + 1] = 8 / 24; grid[12][offset + 2] = 0.5;
    grid[12][offset + 3] = '1:00'; grid[12][offset + 4] = '5:00 PM';
  }
  return { SheetNames: ['DTR'], Sheets: { DTR: utils.aoa_to_sheet(grid) } };
}
test('detects two template copies, source period and numeric times without changing workbook', () => {
  const workbook = fixture(); const original = JSON.stringify(workbook);
  const result = form48FromWorkbook(workbook, utils);
  expect(result.month).toBe('2026-10'); expect(result.copies).toHaveLength(2);
  expect(result.copies[0][0]).toMatchObject({ amArrival: '08:00', amDeparture: '12:00', pmArrival: '1:00', pmDeparture: '5:00 PM' });
  expect(result.copies[0][1].amArrival).toBe('');
  expect(JSON.stringify(workbook)).toBe(original);
});
test('preserves conflicting copies for backend review', () => {
  const workbook = fixture(); workbook.Sheets.DTR.M13.v = '4:00 PM';
  const result = form48FromWorkbook(workbook, utils);
  expect(result.copies[1][0].pmDeparture).toBe('4:00 PM');
  expect(result.copies[0][0].pmDeparture).toBe('5:00 PM');
});
test('formula and error times stay flagged, not trusted cached results', () => {
  const workbook = fixture(); workbook.Sheets.DTR.B13.f = 'NOW()';
  workbook.Sheets.DTR.C13 = { t: 'e', v: 7 };
  const result = form48FromWorkbook(workbook, utils);
  expect(result.copies[0][0]).toMatchObject({ amArrival: '', amDeparture: '', needsReview: true, reviewFields: ['amArrival', 'amDeparture'] });
  expect(result.warnings).toHaveLength(2);
});
test('missing/inconsistent months never default to current date', () => {
  expect(form48FromWorkbook(fixture({ period: '' }), utils).month).toBe('');
  const workbook = fixture(); workbook.Sheets.DTR.I7 = { t: 's', v: 'November 2026' };
  expect(form48FromWorkbook(workbook, utils).month).toBe('');
});
test('unsupported, multiple sheets, malformed days and oversized layout rejected', () => {
  expect(() => form48FromWorkbook({ SheetNames: [] }, utils)).toThrow();
  const workbook = fixture(); workbook.Sheets.DTR.A14.v = 1;
  expect(() => form48FromWorkbook(workbook, utils)).toThrow('expected day 2');
  const multi = fixture(); multi.SheetNames.push('Other'); multi.Sheets.Other = fixture().Sheets.DTR;
  expect(() => form48FromWorkbook(multi, utils)).toThrow('Multiple DTR');
  const huge = fixture(); huge.Sheets.DTR['!ref'] = 'A1:AO200';
  expect(() => form48FromWorkbook(huge, utils)).toThrow('too large');
});
test.each(['biff8', 'xlsx'])('reads a real %s byte stream without uploading', async bookType => {
  const bytes = write(fixture(), { type: 'array', bookType });
  const result = await readDtrSpreadsheet({ name: `test.${bookType === 'biff8' ? 'xls' : 'xlsx'}`, size: bytes.byteLength, arrayBuffer: async () => bytes });
  expect(result.copies).toHaveLength(2); expect(result.month).toBe('2026-10');
  expect(read(bytes, { type: 'array' }).SheetNames).toEqual(['DTR']);
});
test('wrong format and oversized files rejected', async () => {
  await expect(readDtrSpreadsheet({ name: 'test.csv', size: 10 })).rejects.toThrow('XLS');
  await expect(readDtrSpreadsheet({ name: 'test.xls', size: 6 * 1024 * 1024 })).rejects.toThrow('5 MB');
  await expect(readDtrSpreadsheet({ name: 'test.xls', size: 10, arrayBuffer: async () => new Uint8Array(10).buffer })).rejects.toThrow('not a supported');
});
