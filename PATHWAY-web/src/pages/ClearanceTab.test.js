import { csvCell, escapeReportText } from './ClearanceTab';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));

test('clearance CSV quotes values and prevents spreadsheet formula interpretation', () => {
  expect(csvCell('Avery "Demo", Student')).toBe('"Avery ""Demo"", Student"');
  expect(csvCell('=1+1')).toBe('"\'=1+1"');
  expect(csvCell('  @SUM(A1)')).toBe('"\'  @SUM(A1)"');
  expect(csvCell(486)).toBe('"486"');
  expect(csvCell(null)).toBe('""');
});

test('clearance print fields remain text instead of executable HTML', () => {
  expect(escapeReportText('<script>alert("x")</script> & Student')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Student');
  expect(escapeReportText("O'Brien")).toBe('O&#39;Brien');
});
