import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the application loading state', () => {
  render(<App />);
  expect(screen.getByText(/Initializing PATHWAY Portal/i)).toBeInTheDocument();
});

