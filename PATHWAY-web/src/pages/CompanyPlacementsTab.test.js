import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CompanyPlacementsTab from './CompanyPlacementsTab';
import { getDocs } from 'firebase/firestore';
import { adminRequest } from '../adminApi';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('../components/EndorsementDraftDialog', () => () => null);
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn() }));

const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });

describe('coordinator decision retries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

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
      return Promise.resolve(url === '/coordinator/companies' ? { companies: [] } : { history: [] });
    });
    render(<CompanyPlacementsTab department="Technology" selectedSection={{ id: 'section-1', name: 'Section 1' }} />);
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
