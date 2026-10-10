import { fireEvent, render, screen } from '@testing-library/react';
import JournalKeywordSettings from './JournalKeywordSettings';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
test('keyword editor saves scoped categories and shows confirmation', async () => {
  adminRequest.mockResolvedValue({ keywords: { Technical: ['testing'] } });
  const saved = jest.fn();
  render(<JournalKeywordSettings sectionId="section" keywords={{ Technical: ['testing'] }} onSaved={saved} />);
  fireEvent.click(screen.getByText('Save keywords'));
  await screen.findByText('Review keywords saved. No entries were changed.');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/sections/section/journal-keywords', expect.objectContaining({ method: 'PUT' }));
  expect(saved).toHaveBeenCalledWith({ Technical: ['testing'] });
});
test('invalid editor syntax does not submit', async () => {
  adminRequest.mockClear();
  render(<JournalKeywordSettings sectionId="section" keywords={{}} onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText('Competency keywords'), { target: { value: 'bad line' } });
  fireEvent.click(screen.getByText('Save keywords'));
  await screen.findByText('Use Category: keyword, keyword on each line.');
  expect(adminRequest).not.toHaveBeenCalled();
});
