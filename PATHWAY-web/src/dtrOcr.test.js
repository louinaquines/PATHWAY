import { createDtrOcrJob } from './dtrOcr';
import { createWorker } from 'tesseract.js';
import { getDocument } from 'pdfjs-dist';
jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));
jest.mock('tesseract.js/dist/worker.min.js?url', () => 'ocr-worker.js', { virtual: true });
jest.mock('pdfjs-dist', () => ({ getDocument: jest.fn(), GlobalWorkerOptions: {} }));
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'worker.mjs', { virtual: true });
const file = () => ({ name: 'dtr.pdf', size: 10, arrayBuffer: async () => new TextEncoder().encode('%PDF-test').buffer });
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({ drawImage: jest.fn() }));
});
function pdf(pages = 1) {
  const destroy = jest.fn(async () => {});
  getDocument.mockReturnValue({ destroy, promise: Promise.resolve({ numPages: pages, getPage: async () => ({
    getViewport: ({ scale }) => ({ width: 400 * scale, height: 600 * scale }), render: () => ({ promise: Promise.resolve(), cancel: jest.fn() }),
  }) }) });
  return destroy;
}
function engine() {
  const worker = { setParameters: jest.fn(async () => {}), recognize: jest.fn(async () => ({ data: { text: 'October 2026', tsv: '' } })), terminate: jest.fn(async () => {}) };
  createWorker.mockResolvedValue(worker); return worker;
}
test('renders single-page PDF, processes both copies locally and releases resources', async () => {
  const destroy = pdf(), worker = engine();
  const result = await createDtrOcrJob(file(), { copyCount: 2 }).promise;
  expect(result.copies).toHaveLength(2); expect(result.month).toBe('2026-10');
  expect(worker.recognize).toHaveBeenCalledTimes(2); expect(worker.terminate).toHaveBeenCalledTimes(1); expect(destroy).toHaveBeenCalled();
});
test('multipage PDF denied before starting OCR', async () => {
  const destroy = pdf(2);
  await expect(createDtrOcrJob(file()).promise).rejects.toThrow('one monthly DTR page');
  expect(createWorker).not.toHaveBeenCalled(); expect(destroy).toHaveBeenCalled();
});
test('unsupported files and excessive size rejected', async () => {
  await expect(createDtrOcrJob({ name: 'bad.svg', size: 10 }).promise).rejects.toThrow('PDF');
  await expect(createDtrOcrJob({ name: 'big.pdf', size: 6 * 1024 * 1024 }).promise).rejects.toThrow('5 MB');
});
test('cancel during OCR terminates worker and does not return a partial result', async () => {
  pdf(); const worker = engine(); let started;
  const ready = new Promise(resolve => { started = resolve; });
  worker.recognize.mockImplementation(() => { started(); return new Promise(() => {}); });
  const job = createDtrOcrJob(file()); await ready; job.cancel();
  await expect(job.promise).rejects.toThrow('cancelled'); expect(worker.terminate).toHaveBeenCalled();
});
test('timeout bounds stuck OCR jobs and cleans up', async () => {
  pdf(); const worker = engine();
  worker.recognize.mockImplementation(() => new Promise(() => {}));
  await expect(createDtrOcrJob(file(), { timeoutMs: 80 }).promise).rejects.toThrow('too long');
  expect(worker.terminate).toHaveBeenCalled();
});
test('worker finishing initialization after cancellation is still terminated', async () => {
  pdf(); let initialized, resolveWorker;
  const ready = new Promise(resolve => { initialized = resolve; });
  createWorker.mockImplementation(() => { initialized(); return new Promise(resolve => { resolveWorker = resolve; }); });
  const worker = { terminate: jest.fn(async () => {}) };
  const job = createDtrOcrJob(file()); await ready; job.cancel();
  await expect(job.promise).rejects.toThrow('cancelled');
  resolveWorker(worker);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});
