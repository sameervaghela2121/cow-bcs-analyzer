import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../src/auth/AuthContext.jsx';
import { setTokens, clearTokens } from '../src/api/client.js';
import App from '../src/App.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

describe('App', () => {
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

  it('sends a logged-in user with no membership selected to the workspace picker instead of the dashboard', async () => {
    setTokens({ accessToken: 'login-only-token' });
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: '1', email: 'multi@example.com', name: 'Multi', status: 'active',
          membershipId: null, organizationId: null, facilityId: null, roleName: null,
        })
      ),
      http.get('http://localhost:4000/api/auth/memberships', () =>
        HttpResponse.json({
          memberships: [
            { id: 'm1', organization: { id: 'org1', name: 'Good Farm', slug: 'good-farm' }, facility: { id: 'fac1', name: 'Modasa', slug: 'modasa' }, role: { id: 'r1', name: 'Staff' } },
            { id: 'm2', organization: { id: 'org2', name: 'Amul Dairy', slug: 'amul-dairy' }, facility: null, role: { id: 'r2', name: 'Org-Admin' } },
          ],
        })
      )
    );
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Choose a workspace')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Good Farm')).toBeInTheDocument());
    expect(screen.getByText('Amul Dairy')).toBeInTheDocument();
  });
});
