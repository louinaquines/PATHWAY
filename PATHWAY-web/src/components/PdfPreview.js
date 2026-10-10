import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url }) {
  const canvas = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    setPdf(null); setPage(1); setError(''); setBusy(true);
    const task = getDocument({ url, isEvalSupported: false });
    task.promise.then(doc => { if (active) setPdf(doc); })
      .catch(() => { if (active) { setError('Could not preview this PDF. Download it to open it.'); setBusy(false); } });
    return () => { active = false; void task.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let rendering;
    setBusy(true); setError('');
    (async () => {
      try {
        const sheet = await pdf.getPage(page);
        if (!active) return;
        const viewport = sheet.getViewport({ scale: 1.5 });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        rendering = sheet.render({ canvasContext: canvas.current.getContext('2d'), viewport });
        await rendering.promise;
      } catch (failure) {
        if (active && failure.name !== 'RenderingCancelledException') setError('Could not preview this PDF. Download it to open it.');
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; rendering?.cancel(); };
  }, [pdf, page]);
  return <section aria-label="PDF preview">
    {pdf && <div className="pdf-page-controls">
      <button type="button" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
      <span>Page {page} of {pdf.numPages}</span>
      <button type="button" disabled={busy || page === pdf.numPages} onClick={() => setPage(page + 1)}>Next page</button>
    </div>}
    {busy && <p role="status">Rendering document…</p>}
    {error && <p role="alert">{error}</p>}
    <canvas ref={canvas} aria-label={`PDF page ${page}`} style={{ display: busy || error ? 'none' : 'block' }} />
  </section>;
}
