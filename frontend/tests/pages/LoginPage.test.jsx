import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import LoginPage from '../../src/pages/LoginPage.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/herd" element={<div>Herd page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('shows an error when the API rejects the credentials', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
      )
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpw');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
  });

  it('logs in successfully with valid credentials', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'ok@example.com', name: 'OK', role: 'staff' },
        })
      )
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email/i), 'ok@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText('Herd page')).toBeInTheDocument());
  });
});
