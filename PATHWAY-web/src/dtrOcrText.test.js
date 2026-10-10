import { form48FromOcr, parseOcrWords } from './dtrOcrText';
const word = (text, x, y, confidence = 95) => `5\t1\t1\t1\t1\t1\t${x}\t${y}\t30\t10\t${confidence}\t${text}`;
function scan({ low = false, missing = false } = {}) {
  const lines = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    word('DAY', 0, 100), word('Arrival', 60, 100), word('Departure', 120, 100), word('Arrival', 180, 100), word('Departure', 240, 100)];
  for (let day = 1; day <= 31; day++) {
    if (missing && day === 15) continue;
    lines.push(word(String(day), 0, 100 + day * 20));
    if (day === 1) lines.push(word('08:00', 60, 120, low ? 40 : 95), word('12:00', 120, 120), word('13:00', 180, 120), word('17:00', 240, 120));
  }
  return { tsv: lines.join('\n'), text: 'DAILY TIME RECORD October 1-31, 2026' };
}
test('maps times using columns and day anchors, preserving mandatory OCR review', () => {
  const result = form48FromOcr(scan());
  expect(result.recognizedRows).toBe(31); expect(result.month).toBe('2026-10');
  expect(result.rows[0]).toMatchObject({ amArrival: '08:00', amDeparture: '12:00', pmArrival: '13:00', pmDeparture: '17:00', needsReview: true });
  expect(result.rows[1].amArrival).toBe('');
});
test('low confidence and missing anchors stay visible for correction', () => {
  expect(form48FromOcr(scan({ low: true })).rows[0].reviewFields).toEqual(['amArrival']);
  const result = form48FromOcr(scan({ missing: true }));
  expect(result.recognizedRows).toBe(30); expect(result.rows[14].needsReview).toBe(true);
  expect(result.warnings.join(' ')).toContain('other rows manually');
});
test('unmapped text does not invent row/column positions or reporting date', () => {
  const result = form48FromOcr({ text: '8:00 12:00 1:00 5:00', tsv: '' });
  expect(result.recognizedRows).toBe(0); expect(result.month).toBe('');
  expect(result.rows.every(row => !row.amArrival)).toBe(true);
  expect(result.warnings.join(' ')).toContain('could not be mapped');
});
test('conflicting periods and invalid TSV handled without HTML execution', () => {
  expect(form48FromOcr({ ...scan(), text: 'October 2026 November 2026' }).month).toBe('');
  expect(parseOcrWords('bad')).toEqual([]);
  expect(parseOcrWords('x'.repeat(2_000_001))).toEqual([]);
});

test('uncertain headers or day anchors cannot establish a reliable table', () => {
  const header = scan(); header.tsv = header.tsv.replace(word('DAY', 0, 100), word('DAY', 0, 100, 20));
  expect(form48FromOcr(header).recognizedRows).toBe(0);
  const anchors = scan();
  for (let day = 1; day <= 20; day++) anchors.tsv = anchors.tsv.replace(word(String(day), 0, 100 + day * 20), word(String(day), 0, 100 + day * 20, 20));
  expect(form48FromOcr(anchors).recognizedRows).toBe(0);
});
