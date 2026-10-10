import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertDialog from './AlertDialog';

test('typing a reason retains focus despite new callback identities on every render', () => {
  function Rejection() {
    const [reason, setReason] = useState('');
    return <AlertDialog open title="Reject document" onCancel={() => {}} onConfirm={() => {}} confirmDisabled={!reason.trim()}>
      <textarea aria-label="Reason" value={reason} onChange={event => setReason(event.target.value)} />
    </AlertDialog>;
  }
  render(<Rejection />);
  const field = screen.getByRole('textbox', { name: 'Reason' });
  userEvent.type(field, 'Please upload a clearer copy.');
  expect(field).toHaveValue('Please upload a clearer copy.');
  expect(field).toHaveFocus();
});

test('Escape uses the latest cancel callback without resetting focus', () => {
  const first = jest.fn(), latest = jest.fn();
  const view = render(<AlertDialog open title="Reject" onCancel={first}><textarea aria-label="Reason" /></AlertDialog>);
  screen.getByRole('textbox').focus();
  view.rerender(<AlertDialog open title="Reject" onCancel={latest}><textarea aria-label="Reason" /></AlertDialog>);
  expect(screen.getByRole('textbox')).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(latest).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
});
