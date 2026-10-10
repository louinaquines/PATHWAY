// Read-only OCR smoke check; never sends the document to an external service.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { form48FromOcr } from '../src/dtrOcrText.js';

const file = process.argv[2];
if (!file) throw new Error('Provide a local scan path.');
const cachePath = path.resolve('../tmp/dtr-ocr-qa-cache');
await fs.mkdir(cachePath, { recursive: true });
const start = Date.now();
let worker;
const timeout = setTimeout(() => {
  void worker?.terminate();
  process.stderr.write('OCR smoke check exceeded 60 seconds.\n');
  process.exit(1);
}, 60000);
try {
  worker = await createWorker('eng', 1, { cachePath });
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  const { data } = await worker.recognize(await fs.readFile(file), {}, { text: true, tsv: true });
  const result = form48FromOcr(data);
  console.log(JSON.stringify({ elapsedMs: Date.now() - start, recognizedRows: result.recognizedRows,
    monthDetected: Boolean(result.month), warnings: result.warnings.length, reviewRequired: result.rows.every(row => row.needsReview) }));
} finally { clearTimeout(timeout); await worker?.terminate(); }
