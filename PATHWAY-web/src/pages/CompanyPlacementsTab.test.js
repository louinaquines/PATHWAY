import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CompanyPlacementsTab from './CompanyPlacementsTab';
import { getDocs } from 'firebase/firestore';
import { adminRequest } from '../adminApi';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('../components/EndorsementDraftDialog', () => () => null);
jest.mock('../components/ReviewedMailAttachment', () => () => null);
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn() }));

const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });

describe('coordinator decision retries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('submitted students are visible in the default review workspace before official assignment', async () => {
    getDocs.mockResolvedValue(snapshot([]));
    getDocs.mockResolvedValueOnce(snapshot([{ id: 'qa-request', sectionId: 'section-1', studentId: 'qa-student', studentName: 'Journey QA', status: 'pending_review', companyName: 'QA Host' }]));
    adminRequest.mockImplementation(url => Promise.resolve(url === '/coordinator/company-directory' ? { companies: [] } : { history: [] }));
    render(<CompanyPlacementsTab department="Technology" selectedSection={{ id: 'section-1', name: 'Section 1' }} />);
    expect(await screen.findByRole('button', { name: 'Placement Reviews' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Journey QA').some(element => element.closest('tr'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Companies' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review pending placements (1)' }));
    expect(screen.getAllByText('Journey QA').some(element => element.closest('tr'))).toBe(true);
  });

  test('loads placement history only when requested', async () => {
    getDocs.mockResolvedValue(snapshot([]));
    adminRequest.mockImplementation(url => Promise.resolve(url === '/coordinator/company-directory' ? { companies: [] } : { history: [] }));
    render(<CompanyPlacementsTab department="Technology" selectedSection={{ id: 'section-1', name: 'Section 1' }} />);
    const history = await screen.findByRole('button', { name: /Placement history/ });
    const url = '/coordinator/placement-history?sectionId=section-1&page=true';
    expect(adminRequest).not.toHaveBeenCalledWith(url);
    fireEvent.click(history);
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(url));
    expect(await screen.findByText('No students in this view yet.')).toBeVisible();
    adminRequest.mockImplementation(request => Promise.resolve(request === url ? { history: [], nextCursor: 'history-anchor' } : { history: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh placements' }));
    const paging = await screen.findByRole('navigation', { name: 'Placement history pages' });
    fireEvent.click(within(paging).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith(url + '&cursor=history-anchor'));
  });

  test('queue shortcuts, search, and student-specific feedback keep reviews easy to navigate', async () => {
    getDocs.mockResolvedValue(snapshot([]));
    getDocs.mockResolvedValueOnce(snapshot([
      { id: 'first', sectionId: 'section-1', studentName: 'Alex Student', studentId: 'alex', status: 'pending_review', companyName: 'Alpha Host' },
      { id: 'second', sectionId: 'section-1', studentName: 'Sam Student', studentId: 'sam', status: 'pending_review', companyName: 'Beta Host' },
    ])).mockResolvedValueOnce(snapshot([{ id: 'final', sectionId: 'section-1', studentName: 'Taylor Student', studentId: 'taylor', status: 'pending_review', companySnapshot: { companyName: 'Final Host' } }])).mockResolvedValueOnce(snapshot([]));
    adminRequest.mockImplementation(url => Promise.resolve(url === '/coordinator/company-directory' ? { companies: [] } : { history: [] }));
    render(<CompanyPlacementsTab department="Technology" selectedSection={{ id: 'section-1', name: 'Section 1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review placement for Alex Student' }));
    const alex = screen.getByRole('textbox', { name: 'Placement feedback for Alex Student' });
    fireEvent.change(alex, { target: { value: 'Correct your dates.' } });
    expect(screen.queryByRole('textbox', { name: 'Placement feedback for Sam Student' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Beta Host' } });
    expect(screen.queryByText('Alpha Host')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Host')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review internship tracking access for Taylor Student' }));
    expect(screen.getByRole('button', { name: 'Approve internship tracking' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Final review feedback for Taylor Student' })).toHaveValue('');
  });

  test.each(['placement', 'final-review'])('%s failure keeps confirmation open and preserves the reason for retry', async kind => {
    const request = { id: 'request-1', sectionId: 'section-1', studentId: 'student-1', studentName: 'Taylor Student', status: 'pending_review', companyId: 'company-1', companyName: 'Host Co.' };
    getDocs.mockImplementation(() => Promise.resolve(snapshot([])));
    getDocs.mockResolvedValueOnce(snapshot(kind === 'placement' ? [request] : []))
      .mockResolvedValueOnce(snapshot(kind === 'final-review' ? [request] : []))
      .mockResolvedValueOnce(snapshot([]));
    let attempts = 0;
    adminRequest.mockImplementation(url => {
      if (url.endsWith('/decision')) {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('Temporary connection failure')) : Promise.resolve({});
      }
      return Promise.resolve(url === '/coordinator/company-directory' ? { companies: [] } : { history: [] });
    });
    render(<CompanyPlacementsTab department="Technology" selectedSection={{ id: 'section-1', name: 'Section 1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Placement Reviews/ }));
    fireEvent.click(await screen.findByRole('button', { name: (kind === 'placement' ? 'Review placement' : 'Review internship tracking access') + ' for Taylor Student' }));
    const reason = await screen.findByPlaceholderText('Reason for changes or rejection');
    fireEvent.change(reason, { target: { value: 'Correct the placement dates.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Request changes' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Temporary connection failure'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(reason).toHaveValue('Correct the placement dates.');
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Request changes' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const decisions = adminRequest.mock.calls.filter(([url]) => url.endsWith('/decision'));
    expect(decisions).toHaveLength(2);
    expect(decisions[1][0]).toBe(`/coordinator/${kind === 'placement' ? 'company-placements' : 'final-reviews'}/request-1/decision`);
    expect(JSON.parse(decisions[1][1].body)).toEqual({ status: 'needs_revision', reason: 'Correct the placement dates.' });
  });
});
