import { useEffect, useRef, useState } from 'react';
import PdfPreview from './PdfPreview';
export default function ReviewedMailAttachment({ value, onChange, disabled, onBusy = () => {} }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  async function select(event) {
    const file = event.target.files?.[0];
    const current = ++generation.current;
    onChange(null); setUrl(''); setError('');
    if (!file) return;
    if (file.size > 512 * 1024 || !/^[A-Za-z0-9 _().-]{1,100}\.pdf$/i.test(file.name)) {
      setError('Choose a PDF up to 512 KB with a simple filename.'); return;
    }
    setBusy(true); onBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('This file is not a PDF.');
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      if (generation.current !== current) return;
      setUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
      onChange({ name: file.name, base64: btoa(binary), reviewed: false });
    } catch (failure) { if (generation.current === current) setError(failure.message || 'Could not read the PDF.'); }
    finally { if (generation.current === current) { setBusy(false); onBusy(false); } }
  }
  return <section className="company-mail-attachment-review" aria-label="Optional PDF attachment">
    <label>Attach PDF (optional, up to 512 KB)<input type="file" accept="application/pdf,.pdf" disabled={disabled || busy} onChange={select} /></label>
    {busy && <p role="status">Reading PDF…</p>}
    {error && <p role="alert">{error}</p>}
    {value && <><p>{value.name} · Files are not virus-scanned or signature-verified. Only attach files you trust.</p>
      {url && <PdfPreview url={url} />}
      <label><input type="checkbox" checked={value.reviewed} disabled={disabled} onChange={event => onChange({ ...value, reviewed: event.target.checked })} />
        I reviewed this PDF and it is appropriate to send to the displayed recipient.</label></>}
  </section>;
}
