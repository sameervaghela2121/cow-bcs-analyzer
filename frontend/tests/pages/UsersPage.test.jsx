import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UsersPage from '../../src/pages/UsersPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderUsers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><UsersPage /></QueryClientProvider>);
}

describe('UsersPage', () => {
  it('lists users and sends an invite', async () => {
    let inviteBody;
    server.use(
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({ users: [{ id: 'u1', name: 'Maria', email: 'maria@example.com', role: 'admin', status: 'active' }] })
      ),
      http.post('http://localhost:4000/api/users/invite', async ({ request }) => {
        inviteBody = await request.json();
        return HttpResponse.json({ user: { id: 'u2', email: inviteBody.email, name: inviteBody.name, role: inviteBody.role, status: 'pending' } }, { status: 201 });
      })
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/name/i), 'New Person');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => expect(inviteBody).toEqual({ email: 'new@example.com', name: 'New Person', role: 'staff' }));
  });
});
