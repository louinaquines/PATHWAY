import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./firebase', () => ({ auth: {}, db: {} }));
jest.mock('pdfjs-dist', () => ({ getDocument: jest.fn(), GlobalWorkerOptions: {} }));
jest.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => 'local-worker.mjs', { virtual: true });
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => jest.fn()) }));

test('renders the application loading state', () => {
  render(<App />);
  expect(screen.getByText(/Initializing PATHWAY Portal/i)).toBeInTheDocument();
});
