import { form48FromOcr } from './dtrOcrText';

// Split PDF text items into word boxes in OCR coordinates (top-left origin), one set per side-by-side copy.
async function readPdfText(page, base, copyCount) {
  const content = await page.getTextContent();
  const words = [];
  for (const item of content.items) {
    const text = (item.str || '').trim(); if (!text) continue;
    const [, , , , x, yBase] = item.transform;
    const height = Math.abs(item.height || item.transform[3]) || 8;
    const top = base.height - yBase - height;
    const parts = item.str.split(/(\s+)/); const perChar = (item.width || text.length * height * 0.5) / Math.max(1, item.str.length);
    let offset = 0;
    for (const part of parts) {
      if (part.trim()) words.push({ text: part.trim(), x: x + offset * perChar, y: top, width: part.length * perChar, height, confidence: 100 });
      offset += part.length;
    }
  }
  if (words.filter(w => /^\d{1,2}:\d{2}$/.test(w.text)).length < 4) return null;
  const scans = [];
  for (let index = 0; index < copyCount; index++) {
    const left = base.width * index / copyCount, right = base.width * (index + 1) / copyCount;
    const own = words.filter(w => w.x + w.width / 2 >= left && w.x + w.width / 2 < right).map(w => ({ ...w, x: w.x - left }));
    scans.push(form48FromOcr({ words: own, text: own.map(w => w.text).join(' ') }));
  }
  if (!scans.every(scan => scan.recognizedRows >= 20)) return null;
  const periods = new Set(scans.map(scan => scan.month).filter(Boolean));
  const month = periods.size === 1 && scans.every(scan => scan.month) ? [...periods][0] : '';
  return { copies: scans.map(scan => scan.rows), month, sheetName: 'Form 48 (PDF text)',
    warnings: [...scans.flatMap((scan, i) => scan.warnings.map(warning => `Copy ${i + 1}: ${warning}`)), ...(!month ? ['Confirm the month for all copies.'] : [])],
    extractedText: scans.map((scan, i) => `Copy ${i + 1}\n${scan.text}`).join('\n\n'), source: 'pdf-text' };
}

export function createDtrOcrJob(file, { copyCount = 1, onProgress = () => {}, timeoutMs = 120000 } = {}) {
  let stopped = false, worker, pdfTask, renderTask, timer;
  const canvases = new Set();
  let rejectStop;
  const stop = new Promise((_, reject) => { rejectStop = reject; });
  const release = () => {
    for (const canvas of canvases) canvas.width = canvas.height = 0;
    canvases.clear();
    if (worker) { void worker.terminate().catch(() => {}); worker = null; }
    renderTask?.cancel();
    if (pdfTask) { void pdfTask.destroy().catch(() => {}); pdfTask = null; }
  };
  const cancel = (message = 'OCR cancelled.') => { if (!stopped) { stopped = true; rejectStop(new Error(message)); release(); } };
  const check = () => { if (stopped) throw new Error('OCR cancelled.'); };
  const run = async () => {
    if (!file || !/\.(pdf|png|jpe?g)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF, PNG or JPEG up to 5 MB.');
    if (![1, 2].includes(copyCount)) throw new Error('Choose one copy or two side-by-side copies.');
    const bytes = new Uint8Array(await file.arrayBuffer()); check();
    let canvas = document.createElement('canvas');
    canvases.add(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot render the scan. Enter times manually.');
    if (String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') {
      onProgress('Rendering PDF…');
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); check();
      GlobalWorkerOptions.workerSrc = workerUrl;
      pdfTask = getDocument({ data: bytes, isEvalSupported: false });
      const pdf = await pdfTask.promise; check();
      if (pdf.numPages !== 1) throw new Error('Import one monthly DTR page at a time.');
      const page = await pdf.getPage(1); check();
      const base = page.getViewport({ scale: 1 });
      if (!Number.isFinite(base.width * base.height) || base.width <= 0 || base.height <= 0) throw new Error('Invalid PDF page.');
      const scale = Math.min(2.5, 2400 / Math.max(base.width, base.height));
      // Typed PDFs already contain the text: read it directly (exact and instant) before falling back to OCR.
      const fromText = await readPdfText(page, base, copyCount).catch(() => null); check();
      if (fromText) { canvas.width = canvas.height = 0; return fromText; }
      const viewport = page.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      renderTask = page.render({ canvasContext: context, viewport }); await renderTask.promise; check();
    } else {
      const png = bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 8)) === 'PNG\r\n\x1a\n';
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if (!png && !jpeg) throw new Error('The scan is not a valid supported image or PDF.');
      const url = URL.createObjectURL(file);
      const image = new Image();
      try {
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Could not open the image.')); image.src = url; }); check();
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 20_000_000) throw new Error('Use an image smaller than 20 megapixels.');
        const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      } finally { URL.revokeObjectURL(url); }
    }
    onProgress('Loading OCR engine…');
    const { createWorker } = await import('tesseract.js'); check();
    const { default: ocrWorkerUrl } = await import('tesseract.js/dist/worker.min.js?url'); check();
    const created = await createWorker('eng', 1, { workerPath: ocrWorkerUrl, logger: message => {
      if (!stopped && message.status === 'recognizing text') onProgress(`Reading scan… ${Math.round((message.progress || 0) * 100)}%`);
    } });
    if (stopped) { await created.terminate(); check(); }
    worker = created;
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }); check();
    const scans = [];
    for (let index = 0; index < copyCount; index++) {
      onProgress(`Reading copy ${index + 1} of ${copyCount}…`);
      const crop = document.createElement('canvas');
      canvases.add(crop);
      const left = Math.floor(canvas.width * index / copyCount);
      crop.width = Math.floor(canvas.width * (index + 1) / copyCount) - left; crop.height = canvas.height;
      const cropContext = crop.getContext('2d');
      if (!cropContext) throw new Error('This browser cannot render the scan. Enter times manually.');
      cropContext.drawImage(canvas, left, 0, crop.width, crop.height, 0, 0, crop.width, crop.height);
      const { data } = await worker.recognize(crop, {}, { text: true, tsv: true }); check();
      scans.push(form48FromOcr(data)); crop.width = crop.height = 0;
    }
    canvas.width = canvas.height = 0;
    const periods = new Set(scans.map(scan => scan.month).filter(Boolean));
    const month = periods.size === 1 && scans.every(scan => scan.month) ? [...periods][0] : '';
    return { copies: scans.map(scan => scan.rows), month, sheetName: 'Scanned Form 48',
      warnings: [...scans.flatMap((scan, i) => scan.warnings.map(warning => `Copy ${i + 1}: ${warning}`)), ...(!month ? ['Confirm the month for all copies.'] : [])],
      extractedText: scans.map((scan, i) => `Copy ${i + 1}\n${scan.text}`).join('\n\n'), source: 'ocr' };
  };
  timer = setTimeout(() => cancel('OCR took too long. Use a clearer scan or enter times manually.'), timeoutMs);
  const promise = Promise.race([run(), stop]).finally(() => { clearTimeout(timer); stopped = true; release(); });
  return { promise, cancel };
}
