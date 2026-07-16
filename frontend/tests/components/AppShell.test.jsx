import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import AppShell from '../../src/components/AppShell.jsx';

vi.mock('../../src/auth/AuthContext.jsx', async () => {
  const actual = await vi.importActual('../../src/auth/AuthContext.jsx');
  return {
    ...actual,
    useAuth: () => ({ user: { role: 'admin', name: 'Admin' }, logout: vi.fn() }),
  };
});

describe('AppShell', () => {
  it('shows the User Management nav item for admins', () => {
    render(
      <MemoryRouter initialEntries={['/herd']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herd" element={<div>Herd content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Herd content')).toBeInTheDocument();
  });
});
