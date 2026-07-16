import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import AcceptInvitePage from '../../src/pages/AcceptInvitePage.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function renderPage(search) {
  return render(
    <MemoryRouter initialEntries={[`/accept-invite${search}`]}>
      <AuthProvider><AcceptInvitePage /></AuthProvider>
    </MemoryRouter>
  );
}

describe('AcceptInvitePage', () => {
  it('submits the token from the URL plus a chosen password', async () => {
    let sentBody;
    server.use(
      http.post('http://localhost:4000/api/auth/accept-invite', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'invitee@example.com', name: 'Invitee', role: 'staff' },
        });
      })
    );
    renderPage('?token=rawtoken123&email=invitee%40example.com');
    await userEvent.type(screen.getByLabelText(/new password/i), 'my-new-password');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(sentBody).toEqual({
      email: 'invitee@example.com', token: 'rawtoken123', password: 'my-new-password',
    }));
  });

  it('shows an error for an expired or invalid invite', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/accept-invite', () =>
        HttpResponse.json({ error: 'This invite link has expired.' }, { status: 400 })
      )
    );
    renderPage('?token=stale&email=invitee%40example.com');
    await userEvent.type(screen.getByLabelText(/new password/i), 'my-new-password');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  });
});
