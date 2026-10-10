import { render, screen, fireEvent } from '@testing-library/react';
import { adminRequest } from '../adminApi';
import AnnouncementEmailDelivery from './AnnouncementEmailDelivery';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('only pending recipients are selectable and requests contain student IDs, not emails', async () => {
  const data = { connected: true, title: 'TEST ONLY', recipients: {
    a: { name: 'Sample', email: 'sample@example.com', status: 'pending' },
    b: { name: 'Uncertain', email: 'other@example.com', status: 'delivery_unknown' },
    c: { name: 'Blocked', email: 'dex@gmail.com', status: 'blocked_known_bounce' },
  } };
  adminRequest.mockImplementation(async (_path, options) => {
    if (options) { expect(JSON.parse(options.body)).toEqual({ recipientIds: ['a'] }); return { inAppPreserved: true }; }
    return data;
  });
  render(<AnnouncementEmailDelivery announcementId="test" />);
  fireEvent.click(await screen.findByLabelText('Email Sample'));
  expect(screen.getByLabelText('Email Uncertain')).toBeDisabled();
  expect(screen.getByLabelText('Email Blocked')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Email selected (1)' }));
  await screen.findByRole('button', { name: 'Email selected (0)' });
  expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});
