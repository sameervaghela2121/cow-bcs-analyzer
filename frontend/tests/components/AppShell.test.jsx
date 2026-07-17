import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '../../src/components/AppShell.jsx';

const logout = vi.fn();
vi.mock('../../src/auth/AuthContext.jsx', async () => {
  const actual = await vi.importActual('../../src/auth/AuthContext.jsx');
  return {
    ...actual,
    useAuth: () => ({ user: { role: 'admin', name: 'Admin' }, logout }),
  };
});

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
    renderShell();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Herd content')).toBeInTheDocument();
  });

  it('logs out from the icon button next to the profile, with no separate text link', async () => {
    renderShell();
    expect(screen.queryByText(/log out/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
