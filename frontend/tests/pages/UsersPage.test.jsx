import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UsersPage from '../../src/pages/UsersPage.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import { setTokens, clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

const ROLES = [
  { id: 'role-org-admin', name: 'Org-Admin', permissions: [] },
  { id: 'role-facility-admin', name: 'Facility-Admin', permissions: [] },
  { id: 'role-staff', name: 'Staff', permissions: [] },
];

function mockMe({ email = 'maria@example.com', name = 'Maria' } = {}) {
  server.use(
    http.get('http://localhost:4000/api/auth/me', () =>
      HttpResponse.json({
        id: 'u1', email, name, status: 'active',
        membershipId: 'm1', organizationId: 'org1', facilityId: 'fac1', roleName: 'Org-Admin',
      })
    ),
    http.get('http://localhost:4000/api/roles', () => HttpResponse.json({ roles: ROLES }))
  );
}

function renderUsers() {
  setTokens({ accessToken: 'tok' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <UsersPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UsersPage', () => {
  it('lists memberships and sends an invite', async () => {
    mockMe();
    let inviteBody;
    server.use(
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({
          memberships: [
            { id: 'mem1', user: { name: 'Maria', email: 'maria@example.com', status: 'active' }, role: { id: 'role-org-admin', name: 'Org-Admin' }, facility: null, status: 'active' },
          ],
        })
      ),
      http.post('http://localhost:4000/api/users/invite', async ({ request }) => {
        inviteBody = await request.json();
        return HttpResponse.json({ invitation: { id: 'inv1', email: inviteBody.email, status: 'pending' } }, { status: 201 });
      })
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());
    // the invite form's role select defaults to Staff once roles load
    await waitFor(() => expect(screen.getAllByRole('combobox')[0]).toHaveValue('role-staff'));
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/name/i), 'New Person');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => expect(inviteBody).toEqual({ email: 'new@example.com', name: 'New Person', roleId: 'role-staff', facilityId: 'fac1' }));
  });

  it('disables role change and removal for the signed-in user themself, so an admin can never lock themselves out', async () => {
    mockMe();
    server.use(
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({
          memberships: [
            { id: 'mem1', user: { name: 'Maria', email: 'maria@example.com', status: 'active' }, role: { id: 'role-org-admin', name: 'Org-Admin' }, facility: null, status: 'active' },
            { id: 'mem2', user: { name: 'Rohan', email: 'rohan@example.com', status: 'active' }, role: { id: 'role-staff', name: 'Staff' }, facility: 'fac1', status: 'active' },
          ],
        })
      )
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /remove maria/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove rohan/i })).not.toBeDisabled();

    // combobox order: the invite form's own role select, then one per row
    // in list order (Maria, Rohan).
    const roleSelects = screen.getAllByRole('combobox');
    expect(roleSelects[1]).toBeDisabled();
    expect(roleSelects[2]).not.toBeDisabled();
  });

  it('shows a read-only global user list for super_admin, with no invite form', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 'u1', email: 'super@example.com', name: 'Super', status: 'active',
          isSuperAdmin: true, membershipId: null, organizationId: null, facilityId: null, roleName: null,
        })
      ),
      http.get('http://localhost:4000/api/roles', () => HttpResponse.json({ roles: ROLES })),
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({
          users: [
            {
              id: 'u2', name: 'Maria', email: 'maria@example.com', status: 'active',
              memberships: [{ id: 'mem1', organization: { id: 'org1', name: 'Good Farm' }, facility: { id: 'fac1', name: 'Modasa' }, role: { id: 'r1', name: 'Staff' } }],
            },
          ],
        })
      )
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());
    expect(screen.getByText('Good Farm · Modasa · Staff')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send invite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove maria/i })).not.toBeInTheDocument();
  });

  it('narrows the list to the caller\'s own facility for a Facility-Admin', async () => {
    let requestedUrl;
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 'u1', email: 'facadmin@example.com', name: 'Facility-Admin Person', status: 'active',
          membershipId: 'm1', organizationId: 'org1', facilityId: 'fac1', roleName: 'Facility-Admin',
        })
      ),
      http.get('http://localhost:4000/api/roles', () => HttpResponse.json({ roles: ROLES })),
      http.get('http://localhost:4000/api/users', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ memberships: [] });
      })
    );
    renderUsers();
    await waitFor(() => expect(requestedUrl).toBeTruthy());
    expect(new URL(requestedUrl).searchParams.get('facilityId')).toBe('fac1');
  });

  it('only offers Facility-Admin and Staff in the role dropdowns for a Facility-Admin caller - never Org-Admin', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 'u1', email: 'facadmin@example.com', name: 'Facility-Admin Person', status: 'active',
          membershipId: 'm1', organizationId: 'org1', facilityId: 'fac1', roleName: 'Facility-Admin',
        })
      ),
      http.get('http://localhost:4000/api/roles', () => HttpResponse.json({ roles: ROLES })),
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({
          memberships: [
            { id: 'mem1', user: { name: 'Rohan', email: 'rohan@example.com', status: 'active' }, role: { id: 'role-staff', name: 'Staff' }, facility: 'fac1', status: 'active' },
          ],
        })
      )
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Rohan')).toBeInTheDocument());

    const roleSelects = screen.getAllByRole('combobox');
    // combobox order: the invite form's own role select, then one per row.
    for (const select of roleSelects) {
      const optionLabels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
      expect(optionLabels).toEqual(['Facility-Admin', 'Staff']);
    }
  });
});
