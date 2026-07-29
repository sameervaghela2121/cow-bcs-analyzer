import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import OrganizationsPage from '../../src/pages/OrganizationsPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function FacilitiesStub() {
  const { orgId } = useParams();
  return <div>Facilities for org {orgId}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizations']}>
      <Routes>
        <Route path="/organizations" element={<OrganizationsPage />} />
        <Route path="/organizations/:orgId/facilities" element={<FacilitiesStub />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OrganizationsPage', () => {
  it('lists organizations and drills into the clicked one\'s facilities', async () => {
    server.use(
      http.get('http://localhost:4000/api/organizations', () =>
        HttpResponse.json({ organizations: [{ id: 'org1', name: 'Good Farm', slug: 'good-farm', status: 'active' }] })
      )
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Good Farm')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Good Farm'));
    await waitFor(() => expect(screen.getByText('Facilities for org org1')).toBeInTheDocument());
  });

  it('shows an empty state with no organizations', async () => {
    server.use(http.get('http://localhost:4000/api/organizations', () => HttpResponse.json({ organizations: [] })));
    renderPage();
    await waitFor(() => expect(screen.getByText('No organizations yet.')).toBeInTheDocument());
  });

  it('creates a new organization and shows it in the list', async () => {
    let created = false;
    server.use(
      http.get('http://localhost:4000/api/organizations', () =>
        HttpResponse.json({ organizations: created ? [{ id: 'org2', name: 'Amul Dairy', slug: 'amul-dairy', status: 'active' }] : [] })
      ),
      http.post('http://localhost:4000/api/organizations', async ({ request }) => {
        const body = await request.json();
        created = true;
        return HttpResponse.json({ organization: { id: 'org2', name: body.name, slug: 'amul-dairy', status: 'active' } }, { status: 201 });
      }),
      http.get('http://localhost:4000/api/roles', () => HttpResponse.json({ roles: [] }))
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('No organizations yet.')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText('Organization name'), 'Amul Dairy');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(screen.getByText('Amul Dairy')).toBeInTheDocument());
  });

  it('invites an Org-Admin into a specific organization', async () => {
    let inviteBody;
    server.use(
      http.get('http://localhost:4000/api/organizations', () =>
        HttpResponse.json({ organizations: [{ id: 'org1', name: 'Good Farm', slug: 'good-farm', status: 'active' }] })
      ),
      http.get('http://localhost:4000/api/roles', () =>
        HttpResponse.json({ roles: [{ id: 'role-org-admin', name: 'Org-Admin', permissions: [] }] })
      ),
      http.post('http://localhost:4000/api/users/invite', async ({ request }) => {
        inviteBody = await request.json();
        return HttpResponse.json({ invitation: { id: 'inv1', email: inviteBody.email, status: 'pending' } }, { status: 201 });
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Good Farm')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /add org-admin/i }));
    await userEvent.type(screen.getByPlaceholderText('Name'), 'New Owner');
    await userEvent.type(screen.getByPlaceholderText('Email'), 'newowner@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => expect(inviteBody).toEqual({
      email: 'newowner@example.com', name: 'New Owner', roleId: 'role-org-admin', organizationId: 'org1',
    }));
    await waitFor(() => expect(screen.getByText('Invite sent.')).toBeInTheDocument());
  });
});
