import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import { clearTokens } from '../src/api/client.js';
import App from '../src/App.jsx';

describe('App', () => {
  afterEach(() => clearTokens());

  it('redirects an unauthenticated visit to / over to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('BCS Tracker')).toBeInTheDocument());
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});
