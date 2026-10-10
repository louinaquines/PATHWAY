export function documentTextChecks(text, expected = []) {
  const content = String(text || '').slice(0, 100000);
  return { status: 'manual_review', characters: content.trim().length,
    missingTerms: expected.filter(term => !content.toLowerCase().includes(term.toLowerCase())),
    message: content.trim().length < 30 ? 'Little or no text was extracted. This may be a scan; inspect it manually.' : 'Text is available for review. Matching words do not prove completeness or authenticity.' };
}
export async function extractPdfChecks(blob) {
  if (blob.size > 5 * 1024 * 1024) throw new Error('Document exceeds the 5 MB check limit.');
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  GlobalWorkerOptions.workerSrc = worker;
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error('Checks support up to 20 pages. Review this document manually.');
    let text = '';
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      text += content.items.map(item => item.str || '').join(' ') + '\n';
      if (text.length > 100000) throw new Error('Extracted text exceeds the check limit. Review manually.');
    }
    return { ...documentTextChecks(text), pages: pdf.numPages, text };
  } finally { await task.destroy(); }
}
