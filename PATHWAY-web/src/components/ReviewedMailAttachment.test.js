import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReviewedMailAttachment from './ReviewedMailAttachment';
jest.mock('./PdfPreview', () => () => <div>PDF preview</div>);
test('reads a local PDF but requires explicit review', async () => {
  URL.createObjectURL = jest.fn(() => 'blob:test'); URL.revokeObjectURL = jest.fn();
  const onChange = jest.fn(), onBusy = jest.fn();
  const bytes = new TextEncoder().encode('%PDF-1.4\nTEST ONLY\n%%EOF');
  const file = { name: 'test.pdf', size: bytes.length, arrayBuffer: async () => bytes.buffer };
  const view = render(<ReviewedMailAttachment value={null} onChange={onChange} onBusy={onBusy} />);
  fireEvent.change(view.container.querySelector('input[type=file]'), { target: { files: [file] } });
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'test.pdf', reviewed: false })));
  expect(onBusy.mock.calls).toEqual([[true], [false]]);
  const value = onChange.mock.calls.at(-1)[0];
  view.rerender(<ReviewedMailAttachment value={value} onChange={onChange} onBusy={onBusy} />);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(onChange).toHaveBeenLastCalledWith({ ...value, reviewed: true });
  view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});
test('rejects oversized files before reading them', () => {
  const read = jest.fn();
  const view = render(<ReviewedMailAttachment value={null} onChange={jest.fn()} />);
  fireEvent.change(view.container.querySelector('input[type=file]'), { target: { files: [{ name: 'large.pdf', size: 524289, arrayBuffer: read }] } });
  expect(screen.getByRole('alert')).toHaveTextContent('512 KB'); expect(read).not.toHaveBeenCalled();
});
