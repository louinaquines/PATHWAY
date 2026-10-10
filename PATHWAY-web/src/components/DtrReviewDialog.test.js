import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DtrReviewDialog from './DtrReviewDialog';
import { adminRequest, adminDocumentBlob } from '../adminApi';
import { readDtrSpreadsheet } from '../dtrSpreadsheet';
import { createDtrOcrJob } from '../dtrOcr';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn(), adminDocumentBlob: jest.fn() }));
jest.mock('../dtrSpreadsheet', () => ({ readDtrSpreadsheet: jest.fn() }));
jest.mock('../dtrOcr', () => ({ createDtrOcrJob: jest.fn() }));
jest.mock('./PdfPreview', () => () => <div>PDF scan preview</div>);
test('requires document month and sends edited transcription to scoped API', async () => {
  adminRequest.mockResolvedValue({ limitation: 'No midday punches.', results: [], digitalOnlyDates: [] });
  const { container } = render(<DtrReviewDialog student={{ id: 'student', firstName: 'Test' }} onClose={() => {}} />);
  expect(screen.getByText('Compare attendance')).toBeDisabled();
  fireEvent.change(container.querySelector('input[type=month]'), { target: { value: '2026-02' } });
  fireEvent.change(screen.getByLabelText('Day 1 AM arrival'), { target: { value: '08:00' } });
  expect(screen.queryByLabelText('Day 29 AM arrival')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Compare attendance'));
  await waitFor(() => expect(screen.getByText('Results')).toBeInTheDocument());
  const [path, options] = adminRequest.mock.calls.find(([path]) => path.endsWith('/compare'));
  expect(path).toBe('/coordinator/students/student/dtr/compare');
  expect(JSON.parse(options.body).form.copies[0][0].amArrival).toBe('08:00');
  fireEvent.change(screen.getByLabelText('Day 1 AM arrival'), { target: { value: '09:00' } });
  expect(screen.queryByText('Results')).not.toBeInTheDocument();
});
test('import retains both copies and requires review before comparison', async () => {
  readDtrSpreadsheet.mockResolvedValue({ sheetName: 'DTR', month: '2026-10', warnings: [], copies: [
    [{ day: 1, amArrival: '08:00' }], [{ day: 1, amArrival: '09:00' }],
  ] });
  adminRequest.mockResolvedValue({ limitation: 'No midday punches.', results: [], digitalOnlyDates: [] });
  const { container } = render(<DtrReviewDialog student={{ id: 'student' }} onClose={() => {}} />);
  fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [new File(['test'], 'DTR.xls')] } });
  await screen.findByText('Copy 2');
  expect(screen.getByLabelText('Day 1 AM arrival')).toHaveValue('08:00');
  expect(screen.getByText('Compare attendance')).toBeDisabled();
  fireEvent.click(screen.getByText('Copy 2'));
  expect(screen.getByLabelText('Day 1 AM arrival')).toHaveValue('09:00');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Compare attendance'));
  await screen.findByText('Results');
  expect(JSON.parse(adminRequest.mock.calls.find(([path]) => path.endsWith('/compare'))[1].body).form.copies).toHaveLength(2);
});
test('OCR import shows original scan, requires review and keeps low-confidence cells flagged', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:scan'); URL.revokeObjectURL = jest.fn();
  const cancel = jest.fn();
  createDtrOcrJob.mockReturnValue({ cancel, promise: Promise.resolve({ sheetName: 'Scan', month: '2026-10', source: 'ocr', extractedText: '<script>not executable</script>', warnings: ['Check handwriting.'], copies: [[
    { day: 1, amArrival: '08:00', amDeparture: '12:00', ocrReview: true, needsReview: true, reviewFields: ['amArrival'] },
  ]] }) });
  adminRequest.mockResolvedValue({ limitation: 'No midday punches.', results: [], digitalOnlyDates: [] });
  const view = render(<DtrReviewDialog student={{ id: 'student' }} onClose={() => {}} />);
  fireEvent.change(view.container.querySelector('input[type=file]'), { target: { files: [new File(['test'], 'DTR.png')] } });
  await screen.findByText('Check handwriting.');
  expect(screen.getByText('Compare attendance')).toBeDisabled();
  expect(screen.getByAltText('Original DTR scan for checking extracted times')).toHaveAttribute('src', 'blob:scan');
  fireEvent.change(screen.getByLabelText('Day 1 AM arrival'), { target: { value: '08:01' } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Compare attendance'));
  await screen.findByText('Results');
  expect(JSON.parse(adminRequest.mock.calls.find(([path]) => path.endsWith('/compare'))[1].body).form.copies[0][0].needsReview).toBe(false);
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scan');
});

test('submitted import enables file-linked saving and displays saved history', async () => {
  const comparison = { results: [], digitalOnlyDates: [], limitation: 'Snapshot only.' };
  adminRequest.mockImplementation(async (path, options) => {
    if (path.endsWith('/source')) return { fileName: 'test.xls', version: 'a'.repeat(64) };
    if (path.endsWith('/compare')) return comparison;
    if (options?.method === 'POST') return { review: { id: 'saved', period: '2026-10', fileName: 'test.xls', coordinatorId: 'staff', createdAt: '2026-10-11T00:00:00Z', comparison } };
    return { reviews: [] };
  });
  adminDocumentBlob.mockResolvedValue(new Blob(['test']));
  readDtrSpreadsheet.mockResolvedValue({ month: '2026-10', sheetName: 'DTR', warnings: [], copies: [[{ day: 1, amArrival: '08:00' }]] });
  render(<DtrReviewDialog student={{ id: 'student' }} onClose={() => {}} />);
  fireEvent.click(screen.getByText('Import submitted DTR'));
  await screen.findByRole('checkbox'); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Compare attendance')); await screen.findByText('Results');
  fireEvent.click(screen.getByText('Save review'));
  await screen.findByText('Review saved. Attendance and document status are unchanged.');
  expect(screen.getByText('test.xls · Reviewed by staff')).toBeInTheDocument();
  const payload = JSON.parse(adminRequest.mock.calls.find(([path, options]) => path.endsWith('/reviews') && options?.method === 'POST')[1].body);
  expect(payload.sourceVersion).toBe('a'.repeat(64)); expect(payload.form.month).toBe(10);
});
