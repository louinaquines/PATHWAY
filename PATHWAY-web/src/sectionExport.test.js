import { buildSectionWorkbook, sectionExportRows } from './sectionExport';

test('exports section records and numeric approval ratios without sensitive fields', () => {
  const result = sectionExportRows({ name: 'A', department: 'IT' }, [{ idNumber: '00123', firstName: '=Example', lastName: 'Student', password: 'secret', requirements: { a: { status: 'approved', url: 'private' }, b: { status: 'submitted' } } }], [{ id: 'a', label: 'Form' }, { id: 'b', label: 'Resume' }]);
  expect(result.summary[0][0]).toBe('00123');
  expect(result.summary[0][2]).toBe('=Example');
  expect(result.summary[0][9]).toBe(0.5);
  expect(result.summary[0].slice(10)).toEqual(['Approved', 'Pending review']);
  expect(result.details.map(row => row[4])).toEqual(['Approved', 'Pending review']);
  expect(JSON.stringify(result)).not.toMatch(/secret|private/);
});

test('empty checklist has no misleading completion percentage', () => {
  expect(sectionExportRows({}, [{}], []).summary[0][9]).toBeNull();
  expect(sectionExportRows({}, [], []).summary).toEqual([]);
});

test('creates a valid Excel workbook with identifiers and user text preserved safely', async () => {
  const workbook = await buildSectionWorkbook({ name: 'Test section' }, [{ idNumber: '00123', firstName: '=1+1', requirements: { a: { status: 'approved' } } }], [{ id: 'a', label: 'Application' }]);
  const buffer = await workbook.xlsx.writeBuffer();
  const restored = new workbook.constructor();
  await restored.xlsx.load(buffer);
  expect(restored.worksheets.map(sheet => sheet.name)).toEqual(['Student summary', 'Requirements', 'Export information']);
  const summary = restored.getWorksheet('Student summary');
  expect(summary.getCell('A2').value).toBe('00123');
  expect(summary.getCell('C2').value).toBe('=1+1');
  expect(summary.getCell('J2').value).toBe(1);
  expect(summary.getCell('J2').numFmt).toBe('0%');
  expect(summary.getCell('K1').value).toBe('Application');
  expect(summary.getCell('K2').value).toBe('Approved');
  expect(summary.views[0].ySplit).toBe(1);
}, 15000);

test('each configured requirement has a named column and missing records show not submitted', async () => {
  const workbook = await buildSectionWorkbook({}, [{}], [{ id: 'form', label: 'Application Form' }, { id: 'resume', label: 'Updated Resume' }]);
  const sheet = workbook.getWorksheet('Student summary');
  expect(sheet.getCell('K1').value).toBe('Application Form');
  expect(sheet.getCell('L1').value).toBe('Updated Resume');
  expect(sheet.getCell('K2').value).toBe('Not submitted');
  expect(sheet.getCell('L2').value).toBe('Not submitted');
});
