import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import FacilitiesPage from '../../src/pages/FacilitiesPage.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import { setTokens, clearTokens, getViewScope } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function mockMe() {
  server.use(
    http.get('http://localhost:4000/api/auth/me', () =>
      HttpResponse.json({
        id: 'u1', email: 'orgadmin@example.com', name: 'Org-Admin Person', status: 'active',
        membershipId: 'm1', organizationId: 'org1', facilityId: null, roleName: 'Org-Admin',
      })
    )
  );
}

function renderPage(initialPath = '/facilities') {
  setTokens({ accessToken: 'tok' });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/organizations/:orgId/facilities" element={<FacilitiesPage />} />
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('FacilitiesPage', () => {
  it('lists an Org-Admin\'s own organization\'s facilities (no organizationId needed) and picking one sets the view scope and navigates to /dashboard', async () => {
    mockMe();
    let requestedUrl;
    server.use(
      http.get('http://localhost:4000/api/facilities', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ facilities: [{ id: 'fac1', name: 'Modasa', slug: 'modasa', status: 'active' }] });
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Modasa')).toBeInTheDocument());
    expect(new URL(requestedUrl).searchParams.get('organizationId')).toBeNull();

    await userEvent.click(screen.getByText('Modasa'));
    await waitFor(() => expect(screen.getByText('Dashboard content')).toBeInTheDocument());
    expect(getViewScope()).toEqual({ organizationId: 'org1', facilityId: 'fac1' });
  });

  it('passes the orgId route param through as organizationId when drilling down from Organizations (super_admin)', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 'u1', email: 'super@example.com', name: 'Super', status: 'active',
          isSuperAdmin: true, membershipId: null, organizationId: null, facilityId: null, roleName: null,
        })
      )
    );
    let requestedUrl;
    server.use(
      http.get('http://localhost:4000/api/facilities', ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ facilities: [{ id: 'fac2', name: 'Anand', slug: 'anand', status: 'active' }] });
      })
    );
    renderPage('/organizations/org2/facilities');
    await waitFor(() => expect(screen.getByText('Anand')).toBeInTheDocument());
    expect(new URL(requestedUrl).searchParams.get('organizationId')).toBe('org2');

    await userEvent.click(screen.getByText('Anand'));
    await waitFor(() => expect(screen.getByText('Dashboard content')).toBeInTheDocument());
    expect(getViewScope()).toEqual({ organizationId: 'org2', facilityId: 'fac2' });
  });

  it('does not show the "Add a facility" form to an Org-Admin - facility setup is super_admin\'s job', async () => {
    mockMe();
    server.use(http.get('http://localhost:4000/api/facilities', () => HttpResponse.json({ facilities: [] })));
    renderPage();
    await waitFor(() => expect(screen.getByText('No facilities yet.')).toBeInTheDocument());
    expect(screen.queryByText('Add a facility')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Facility name')).not.toBeInTheDocument();
  });

  it('lets super_admin create a new facility under the drilled-down organization and shows it in the list', async () => {
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({
          id: 'u1', email: 'super@example.com', name: 'Super', status: 'active',
          isSuperAdmin: true, membershipId: null, organizationId: null, facilityId: null, roleName: null,
        })
      )
    );
    let created = false;
    let createBody;
    server.use(
      http.get('http://localhost:4000/api/facilities', () =>
        HttpResponse.json({ facilities: created ? [{ id: 'fac3', name: 'Surat', slug: 'surat', status: 'active' }] : [] })
      ),
      http.post('http://localhost:4000/api/facilities', async ({ request }) => {
        createBody = await request.json();
        created = true;
        return HttpResponse.json({ facility: { id: 'fac3', name: createBody.name, slug: 'surat', status: 'active' } }, { status: 201 });
      })
    );
    renderPage('/organizations/org2/facilities');
    await waitFor(() => expect(screen.getByText('No facilities yet.')).toBeInTheDocument());
    expect(screen.getByText('Add a facility')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('Facility name'), 'Surat');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(screen.getByText('Surat')).toBeInTheDocument());
    expect(createBody.organizationId).toBe('org2');
  });
});
