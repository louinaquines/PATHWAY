import { fireEvent, render, screen } from '@testing-library/react';
import CompanyConversations from './CompanyConversations';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('./ReviewedMailAttachment', () => () => null);
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); });

test('sends only text and request ID to the approved conversation', async () => {
  Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: () => 'fixed-request' });
  adminRequest.mockImplementation(async (path, options) => {
    if (path.endsWith('/replies')) { expect(JSON.parse(options.body)).toEqual({ text: 'Test reply', requestId: 'fixed-request' }); return { status: 'provider_accepted' }; }
    if (path.endsWith('company-conversations')) return { connected: true, conversations: [{ id: 'c', companyName: 'Company', studentId: 'student' }] };
    return { canReply: true, replyTo: 'verified@example.com', refreshedAt: '2026-10-11T00:00:00Z', messages: [] };
  });
  render(<CompanyConversations sectionId="section" />);
  await screen.findByRole('option', { name: 'Company — student' });
  fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: 'c' } });
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Test reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  expect(await screen.findByText(/Reply accepted by Gmail/)).toBeInTheDocument();
  expect(adminRequest.mock.calls.filter(([path]) => path.endsWith('/replies'))).toHaveLength(1);
});

test('uncertain delivery locks composer and prevents another send', async () => {
  adminRequest.mockImplementation(async path => {
    if (path.endsWith('/replies')) throw new Error('Delivery requires review');
    if (path.endsWith('company-conversations')) return { connected: true, conversations: [{ id: 'c', companyName: 'Company', studentId: 'student' }] };
    return { canReply: true, replyTo: 'verified@example.com', refreshedAt: '2026-10-11T00:00:00Z', messages: [] };
  });
  render(<CompanyConversations sectionId="section" />);
  await screen.findByRole('option', { name: 'Company — student' });
  fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: 'c' } });
  fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Test reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
  await screen.findByText('Delivery requires review');
  expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
  expect(screen.getByLabelText('Message')).toBeDisabled();
});

test('reload preserves uncertain-send guard and status check never resends', async () => {
  sessionStorage.setItem('pathway-company-reply:section:c', 'pending-request');
  adminRequest.mockImplementation(async path => {
    if (path.endsWith('/replies/pending-request')) return { status: 'delivery_unknown' };
    if (path.endsWith('company-conversations')) return { connected: true, conversations: [{ id: 'c', companyName: 'Company', studentId: 'student' }] };
    return { canReply: true, replyTo: 'verified@example.com', refreshedAt: '2026-10-11T00:00:00Z', messages: [] };
  });
  render(<CompanyConversations sectionId="section" />);
  await screen.findByRole('option', { name: 'Company — student' });
  fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: 'c' } });
  expect(await screen.findByLabelText('Message')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Check delivery status' }));
  expect(await screen.findByText(/Delivery requires review in the mailbox/)).toBeInTheDocument();
  expect(adminRequest.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
});

test('general discovery submits only a selected student and displays human names', async () => {
  adminRequest.mockImplementation(async (path, options) => {
    if (path.endsWith('/discover')) { expect(JSON.parse(options.body)).toEqual({ studentId: 'student' }); return { conversations: [{ id: 'c' }] }; }
    if (path.endsWith('company-conversations')) return { connected: true, discoveryEnabled: true,
      eligibleStudents: [{ id: 'student', name: 'Sample Student' }], conversations: [{ id: 'c', companyName: 'Company', studentName: 'Sample Student' }] };
    return { canReply: false, refreshedAt: '2026-10-11T00:00:00Z', messages: [] };
  });
  render(<CompanyConversations sectionId="section" />);
  fireEvent.change(await screen.findByLabelText('Student'), { target: { value: 'student' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find company emails' }));
  expect(await screen.findByRole('option', { name: 'Company — Sample Student' })).toBeInTheDocument();
});

test('links only the fixed test reply and loads the returned conversation', async () => {
  let linked = false;
  adminRequest.mockImplementation(async (path, options) => {
    if (path.endsWith('link-test-reply')) { expect(options).toEqual({ method: 'POST', body: '{}' }); linked = true; return { conversationId: 'test' }; }
    if (path.endsWith('company-conversations')) return { connected: true, conversations: linked ? [{ id: 'test', studentId: 'student', companyName: 'TEST ONLY' }] : [] };
    return { refreshedAt: '2026-10-11T00:00:00Z', messages: [{ id: 'reply', text: 'Exact test reply', from: 'test@example.com' }] };
  });
  render(<CompanyConversations sectionId="section" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Link exact test reply' }));
  expect(await screen.findByText('Exact test reply')).toBeInTheDocument();
  expect(adminRequest.mock.calls.filter(([path]) => path.endsWith('link-test-reply'))).toHaveLength(1);
});
test('disconnected inbox is explicit and never offers sending', async () => {
  adminRequest.mockResolvedValue({ connected: false, conversations: [] });
  render(<CompanyConversations sectionId="section" />);
  expect(await screen.findByText(/Inbox not connected/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh replies' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
});
test('renders text safely with sender and time and blocks attachments', async () => {
  adminRequest.mockImplementation(async path => path.endsWith('company-conversations') ? { connected: true, conversations: [{ id: 'conversation', studentId: 'student', companyName: 'Test Company' }] } : {
    refreshedAt: '2026-10-11T00:00:00Z', messages: [{ id: 'reply', from: 'contact@example.com', time: '2026-10-11T00:00:00Z', subject: 'Test reply', text: '<img src=x onerror=alert(1)>', attachments: [{ name: 'test.pdf' }] }],
  });
  const { container } = render(<CompanyConversations sectionId="section" />);
  await screen.findByRole('option', { name: 'Test Company — student' });
  fireEvent.change(screen.getByLabelText('Conversation'), { target: { value: 'conversation' } });
  expect(await screen.findByText('contact@example.com')).toBeInTheDocument();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/Attachment blocked/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh replies' }));
  await screen.findByText('contact@example.com');
  expect(adminRequest.mock.calls.filter(([path]) => path.endsWith('/conversation'))).toHaveLength(2);
});
