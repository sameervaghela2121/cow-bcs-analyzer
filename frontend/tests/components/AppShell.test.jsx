import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AppShell from '../../src/components/AppShell.jsx';

const logout = vi.fn();
vi.mock('../../src/auth/AuthContext.jsx', async () => {
  const actual = await vi.importActual('../../src/auth/AuthContext.jsx');
  return {
    ...actual,
    useAuth: () => ({ user: { role: 'admin', name: 'Admin' }, logout }),
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
  it('shows the User nav item for admins', () => {
    mockCows([]);
    renderShell();
    expect(screen.getByText('User')).toBeInTheDocument();
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
});
