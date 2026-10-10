import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DocumentPreviewDialog, { previewMime } from './DocumentPreviewDialog';
import { adminDocumentBlob, adminRequest } from '../adminApi';
import { extractPdfChecks } from '../documentTextChecks';
jest.mock('../adminApi', () => ({ adminDocumentBlob: jest.fn(), adminDownload: jest.fn(), adminRequest: jest.fn() }));
jest.mock('../documentTextChecks', () => ({ ...jest.requireActual('../documentTextChecks'), extractPdfChecks: jest.fn() }));
jest.mock('./PdfPreview', () => ({ __esModule: true, default: ({ url }) => <div aria-label="PDF preview" data-url={url} /> }));
const bytes = text => Uint8Array.from([...text].map(char => char.charCodeAt(0)));
beforeEach(() => {
  extractPdfChecks.mockResolvedValue({ text: 'Student name Test', characters: 17, pages: 1, message: 'Manual review required.' });
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  URL.createObjectURL = jest.fn(() => 'blob:private-document');
  URL.revokeObjectURL = jest.fn();
});
test('only PDF and supported raster image signatures preview', () => {
  expect(previewMime(bytes('%PDF-1.7'))).toBe('application/pdf');
  expect(previewMime(Uint8Array.from([255, 216, 255]))).toBe('image/jpeg');
  expect(previewMime(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe('image/png');
  expect(previewMime(bytes('RIFF1234WEBP'))).toBe('image/webp');
  expect(previewMime(bytes('<svg></svg>'))).toBeNull();
  expect(previewMime(bytes('PK document'))).toBeNull();
});
test('loads through authenticated helper and releases private URL on close', async () => {
  adminDocumentBlob.mockResolvedValue({ slice: () => ({ arrayBuffer: async () => bytes('%PDF-1.7').buffer }) });
  const close = jest.fn();
  const view = render(<DocumentPreviewDialog path="/protected/download" fileName="test.pdf" onClose={close} />);
  await waitFor(() => expect(screen.getByLabelText('PDF preview')).toHaveAttribute('data-url', 'blob:private-document'));
  expect(adminDocumentBlob).toHaveBeenCalledWith('/protected/download');
  fireEvent.click(screen.getByRole('button', { name: 'Close document preview' }));
  expect(close).toHaveBeenCalled();
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-document');
});
test('failed access shows error without a preview', async () => {
  adminDocumentBlob.mockRejectedValue(new Error('Access denied'));
  render(<DocumentPreviewDialog path="/protected/download" onClose={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
test('required text settings show missing terms and save scoped configuration', async () => {
  adminDocumentBlob.mockResolvedValue({ slice: () => ({ arrayBuffer: async () => bytes('%PDF-1.7').buffer }) });
  adminRequest.mockResolvedValue({ requiredTerms: ['signature'] });
  render(<DocumentPreviewDialog path="/protected/download" sectionId="section" requirementId="resume" onClose={() => {}} />);
  expect(await screen.findByText(/Not found: signature/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Save check settings'));
  await screen.findByText('Check settings saved. Document approval is unchanged.');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/sections/section/document-checks/resume', expect.objectContaining({ method: 'PUT' }));
});
