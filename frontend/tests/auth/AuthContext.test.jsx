import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.jsx';
import { clearTokens, getViewScope } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function Probe() {
  const { user, membership, viewScope, status, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email || 'none'}</div>
      <div data-testid="role">{membership?.roleName || 'none'}</div>
      <div data-testid="facility">{membership?.facilityId || 'none'}</div>
      <div data-testid="scope-facility">{viewScope.facilityId || 'none'}</div>
      <button onClick={() => login('a@example.com', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function renderWithRouter(ui, { initialEntries = ['/'] } = {}) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

// Simulates what useScopedNavigate does at each real call site: attach the
// view scope active *at the moment of navigating* as history state.
function ScopedPage() {
  const { viewScope } = useAuth();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid="scope-facility">{viewScope.facilityId || 'none'}</div>
      <Link to="/a" state={{ organizationId: 'org1', facilityId: 'fac1' }}>go A</Link>
      <Link to="/b" state={{ organizationId: 'org2', facilityId: 'fac2' }}>go B</Link>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts unauthenticated with no stored token, then logs in and auto-selects a single membership', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc',
          user: { id: '1', email: 'a@example.com', name: 'A', status: 'active' },
          membership: {
            id: 'm1',
            organization: { id: 'org1', name: 'Good Farm', slug: 'good-farm' },
            facility: { id: 'fac1', name: 'Modasa', slug: 'modasa' },
            role: { id: 'r1', name: 'Staff' },
          },
        })
      )
    );
    renderWithRouter(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));

    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('a@example.com');
    expect(screen.getByTestId('role').textContent).toBe('Staff');
    expect(screen.getByTestId('facility').textContent).toBe('fac1');
  });

  it('logs in as authenticated but with no membership selected when the account has zero or 2+ memberships', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc',
          user: { id: '1', email: 'multi@example.com', name: 'Multi', status: 'active' },
          membership: null,
        })
      )
    );
    renderWithRouter(<AuthProvider><Probe /></AuthProvider>);
    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('role').textContent).toBe('none');
  });

  it('bootstraps as authenticated with its membership restored from /me on an existing token', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: '1', email: 'existing@example.com', name: 'E', status: 'active',
          membershipId: 'm1', organizationId: 'org1', facilityId: 'fac1', roleName: 'Org-Admin',
        })
      )
    );
    renderWithRouter(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('existing@example.com');
    expect(screen.getByTestId('role').textContent).toBe('Org-Admin');
  });

  it('bootstraps with no membership when /me reports a login-only session (membershipId: null)', async () => {
    localStorage.setItem('bcs_access_token', 'login-only-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: '1', email: 'nopick@example.com', name: 'No Pick', status: 'active',
          membershipId: null, organizationId: null, facilityId: null, roleName: null,
        })
      )
    );
    renderWithRouter(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('role').textContent).toBe('none');
  });

  it('clears user and membership state on logout', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: '1', email: 'existing@example.com', name: 'E', status: 'active',
          membershipId: 'm1', organizationId: 'org1', facilityId: 'fac1', roleName: 'Org-Admin',
        })
      ),
      http.post('http://localhost:4000/api/auth/logout', () => HttpResponse.json({ ok: true }))
    );
    renderWithRouter(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(screen.getByTestId('role').textContent).toBe('none');
  });

  it('restores the view scope active when a history entry was created when navigating back to it, instead of whatever is currently selected', async () => {
    renderWithRouter(
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ScopedPage />} />
          <Route path="/a" element={<ScopedPage />} />
          <Route path="/b" element={<ScopedPage />} />
        </Routes>
      </AuthProvider>
    );
    expect(screen.getByTestId('scope-facility').textContent).toBe('none');

    await userEvent.click(screen.getByText('go A'));
    await waitFor(() => expect(screen.getByTestId('scope-facility').textContent).toBe('fac1'));

    await userEvent.click(screen.getByText('go B'));
    await waitFor(() => expect(screen.getByTestId('scope-facility').textContent).toBe('fac2'));

    await userEvent.click(screen.getByText('back'));
    await waitFor(() => expect(screen.getByTestId('scope-facility').textContent).toBe('fac1'));
    expect(getViewScope()).toEqual({ organizationId: 'org1', facilityId: 'fac1' });
  });
});
