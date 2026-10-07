import { buildStudentRecordsWorkbook } from './studentRecordsExport';

test('Excel contains attendance and journals, correct timezone, safe text, and separate hours', async () => {
  const workbook = await buildStudentRecordsWorkbook({ idNumber: '00123', firstName: '=1+1', lastName: 'Student', password: 'secret' }, { name: 'QA Section' }, [{ date: '2026-10-08', timeIn: '2026-10-07T18:45:38.775Z', timeOut: '2026-10-07T18:47:13.086Z', hoursToday: 0.03, location: 'private-coordinates' }], [{ weekNum: 1, hours: 8, status: 'pending', rawNotes: '=SUM(A1)', refined: 'QA report', fileUrl: 'private-url' }]);
  const buffer = await workbook.xlsx.writeBuffer();
  const restored = new workbook.constructor();
  await restored.xlsx.load(buffer);
  expect(restored.worksheets.map(sheet => sheet.name)).toEqual(['Attendance', 'Weekly Journals', 'Export information']);
  const attendance = restored.getWorksheet('Attendance');
  expect(attendance.getCell('A2').value).toBe('00123');
  expect(attendance.getCell('B2').value).toBe('=1+1 Student');
  expect(attendance.getCell('E2').value).toContain('02:45:38 AM');
  expect(attendance.getCell('G2').value).toBe(0.03);
  expect(restored.getWorksheet('Weekly Journals').getCell('F2').value).toBe(8);
  expect(restored.getWorksheet('Weekly Journals').getCell('K2').value).toBe('=SUM(A1)');
  const values = restored.worksheets.flatMap(sheet => sheet.getSheetValues());
  expect(JSON.stringify(values)).not.toMatch(/secret|private-url|private-coordinates/);
}, 15000);

test('empty exports keep both sheet headers and active punches have blank hours', async () => {
  const workbook = await buildStudentRecordsWorkbook({}, {}, [{ timeIn: '2026-10-07T18:45:38.775Z' }], []);
  expect(workbook.getWorksheet('Weekly Journals').rowCount).toBe(1);
  expect(workbook.getWorksheet('Attendance').getCell('G2').value).toBeNull();
  expect(workbook.getWorksheet('Attendance').getCell('H2').value).toBe('In progress');
});
