import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./firebase', () => ({ auth: {}, db: {} }));
jest.mock('pdfjs-dist', () => ({ getDocument: jest.fn(), GlobalWorkerOptions: {} }));
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'local-worker.mjs', { virtual: true });
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => jest.fn()) }));
jest.mock('./pages/SupervisorEvaluationPage', () => () => <h1>Supervisor verification</h1>);

test('renders the application loading state', () => {
  window.history.replaceState({}, '', '/coordinator');
  render(<App />);
  expect(screen.getByText(/Initializing PATHWAY Portal/i)).toBeInTheDocument();
});

test('public evaluation does not wait for staff authentication', () => {
  window.history.replaceState({}, '', '/evaluate?token=fixture');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Supervisor verification' })).toBeInTheDocument();
  expect(screen.queryByText(/Initializing PATHWAY Portal/i)).not.toBeInTheDocument();
});
