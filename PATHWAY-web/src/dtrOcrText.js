const fields = ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'];
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const centre = word => word.x + word.width / 2;
const middle = word => word.y + word.height / 2;

export function parseOcrWords(tsv) {
  if (typeof tsv !== 'string' || tsv.length > 2_000_000) return [];
  return tsv.split(/\r?\n/).slice(1).map(line => {
    const cells = line.split('\t');
    const [x, y, width, height, confidence] = cells.slice(6, 11).map(Number);
    return { level: Number(cells[0]), x, y, width, height, confidence, text: cells.slice(11).join('\t').trim() };
  }).filter(word => word.level === 5 && word.text && [word.x, word.y, word.width, word.height, word.confidence].every(Number.isFinite)
    && word.width > 0 && word.height > 0);
}

export function form48FromOcr(data) {
  const words = parseOcrWords(data.tsv);
  const rows = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, ocrReview: true, needsReview: true }));
  const warnings = ['OCR can misread handwriting and blank cells. Check every time against the scan.'];
  const dayHeader = words.find(word => /^day$/i.test(word.text) && word.confidence >= 70);
  let recognizedRows = 0;
  if (dayHeader) {
    const headerWords = words.filter(word => Math.abs(middle(word) - middle(dayHeader)) < Math.max(18, dayHeader.height * 1.5));
    const times = headerWords.filter(word => word.confidence >= 70 && /^(arrival|departure)$/i.test(word.text) && centre(word) > centre(dayHeader)).sort((a, b) => centre(a) - centre(b)).slice(0, 4);
    if (times.length === 4 && times.every((word, i) => word.text.toLowerCase() === (i % 2 ? 'departure' : 'arrival'))) {
      const centres = [centre(dayHeader), ...times.map(centre)];
      const dayRight = (centres[0] + centres[1]) / 2;
      const anchors = words.filter(word => word.confidence >= 70 && /^\d{1,2}$/.test(word.text) && centre(word) < dayRight
        && centre(word) > centres[0] - (centres[1] - centres[0]) / 2 && word.y > dayHeader.y + dayHeader.height)
        .map(word => ({ ...word, day: Number(word.text) })).filter(word => word.day >= 1 && word.day <= 31).sort((a, b) => middle(a) - middle(b));
      const unique = new Set(anchors.map(word => word.day));
      const ordered = anchors.every((word, i) => !i || word.day > anchors[i - 1].day);
      if (unique.size >= 20 && unique.size === anchors.length && ordered) {
        const gaps = anchors.slice(1).map((word, i) => (middle(word) - middle(anchors[i])) / (word.day - anchors[i].day)).sort((a, b) => a - b);
        const step = gaps[Math.floor(gaps.length / 2)];
        if (step > 0) for (const anchor of anchors) {
          const row = rows[anchor.day - 1]; recognizedRows++;
          fields.forEach((field, i) => {
            const left = (centres[i] + centres[i + 1]) / 2;
            const right = i < 3 ? (centres[i + 1] + centres[i + 2]) / 2 : centres[4] + (centres[4] - centres[3]) / 2;
            const tokens = words.filter(word => centre(word) >= left && centre(word) < right && Math.abs(middle(word) - middle(anchor)) < step * 0.45)
              .sort((a, b) => a.x - b.x);
            const text = tokens.map(word => word.text).join(' ').slice(0, 80);
            row[field] = text;
            if (text && (!/^\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?$/i.test(text) || tokens.some(word => word.confidence < 70))) {
              row.reviewFields = [...(row.reviewFields || []), field];
            }
          });
        }
      }
    }
  }
  if (!recognizedRows) warnings.push('The table could not be mapped reliably. Enter times manually using the scan and extracted text.');
  else if (recognizedRows < 31) warnings.push(`Only ${recognizedRows} day rows were located. Check the other rows manually.`);
  const periods = new Set();
  for (const match of String(data.text || '').matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b\s*(?:\d{1,2}\s*[-–]\s*\d{1,2}\s*,?\s*)?(\d{4})\b/gi)) {
    if (Number(match[2]) >= 1900 && Number(match[2]) <= 2200) periods.add(`${match[2]}-${String(months.indexOf(match[1].toLowerCase()) + 1).padStart(2, '0')}`);
  }
  if (periods.size !== 1) warnings.push('Confirm the document month and year.');
  return { rows, month: periods.size === 1 ? [...periods][0] : '', warnings, recognizedRows, text: String(data.text || '').slice(0, 30000) };
}
