import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AppShell from '../../src/components/AppShell.jsx';

const logout = vi.fn();
const defaultAuth = {
  user: { name: 'Admin' }, membership: { roleName: 'Org-Admin' }, isSuperAdmin: false,
  viewScope: { organizationId: 'org1', facilityId: 'fac1' }, logout,
};
let mockAuth = { ...defaultAuth };
vi.mock('../../src/auth/AuthContext.jsx', async () => {
  const actual = await vi.importActual('../../src/auth/AuthContext.jsx');
  return {
    ...actual,
    useAuth: () => mockAuth,
  };
});

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockCows(cows) {
  server.use(http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows, total: cows.length })));
}

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/herd']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herd" element={<div>Herd content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppShell', () => {
  afterEach(() => { mockAuth = { ...defaultAuth }; });

  it('shows the Users and Facilities nav items for an Org-Admin', () => {
    mockCows([]);
    renderShell();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Facilities')).toBeInTheDocument();
    expect(screen.getByText('Herd content')).toBeInTheDocument();
  });

  it('logs out from the icon button next to the profile, with no separate text link', async () => {
    mockCows([]);
    renderShell();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('does not show a review-count badge on the Review nav item', async () => {
    mockCows([
      { id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
      { id: 'c4', cowsId: '7003', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
    ]);
    renderShell();
    await waitFor(() => expect(screen.getByText('Herd content')).toBeInTheDocument());
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('shows only Users and Organizations for super_admin before any facility is picked - no Upload/Herd/Review/Audit/Dashboard/Facilities', () => {
    mockAuth = { user: { name: 'Super' }, membership: null, isSuperAdmin: true, viewScope: { organizationId: null, facilityId: null }, logout };
    mockCows([]);
    renderShell();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
    expect(screen.queryByText('Herd')).not.toBeInTheDocument();
    expect(screen.queryByText('Facilities')).not.toBeInTheDocument();
  });

  it('adds the regular app content nav alongside Users/Organizations once super_admin has picked a facility', () => {
    mockAuth = { user: { name: 'Super' }, membership: null, isSuperAdmin: true, viewScope: { organizationId: 'org1', facilityId: 'fac1' }, logout };
    mockCows([]);
    renderShell();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('Herd')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows only the regular app content (no Users/Facilities) for Staff', () => {
    mockAuth = { user: { name: 'Staffer' }, membership: { roleName: 'Staff' }, isSuperAdmin: false, viewScope: { organizationId: 'org1', facilityId: 'fac1' }, logout };
    mockCows([]);
    renderShell();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Facilities')).not.toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });
});
