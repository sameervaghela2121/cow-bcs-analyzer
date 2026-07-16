import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function Probe() {
  const { user, status, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email || 'none'}</div>
      <button onClick={() => login('a@example.com', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts unauthenticated with no stored token, then logs in successfully', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'a@example.com', name: 'A', role: 'staff' },
        })
      )
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));

    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('a@example.com');
  });

  it('bootstraps as authenticated when a valid access token is already stored', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ id: '1', email: 'existing@example.com', name: 'E', role: 'admin' })
      )
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('existing@example.com');
  });

  it('clears user state on logout', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ id: '1', email: 'existing@example.com', name: 'E', role: 'admin' })
      ),
      http.post('http://localhost:4000/api/auth/logout', () => HttpResponse.json({ ok: true }))
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
  });
});
