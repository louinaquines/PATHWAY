import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PdfPreview from './PdfPreview';
import { getDocument } from 'pdfjs-dist';
jest.mock('pdfjs-dist', () => ({ getDocument: jest.fn(), GlobalWorkerOptions: {} }));
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'local-worker.mjs', { virtual: true });

test('renders pages without a browser PDF plugin and destroys the private document', async () => {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
  const draw = jest.fn(() => ({ promise: Promise.resolve(), cancel: jest.fn() }));
  const getPage = jest.fn(async () => ({ getViewport: () => ({ width: 400, height: 600 }), render: draw }));
  const destroy = jest.fn();
  getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), destroy });
  const view = render(<PdfPreview url="blob:private" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled());
  expect(draw).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() => expect(getPage).toHaveBeenCalledWith(2));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  view.unmount();
  expect(destroy).toHaveBeenCalled();
});

test('shows a useful error for an unreadable PDF', async () => {
  getDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')), destroy: jest.fn() });
  render(<PdfPreview url="blob:invalid" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Download it to open it');
});
