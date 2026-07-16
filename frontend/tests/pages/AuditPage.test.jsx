import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuditPage from '../../src/pages/AuditPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AuditPage', () => {
  it('renders audit entries from the API', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{ cowId: '4417', action: 'overridden', oldScore: 3.5, newScore: 3.25, createdAt: '2026-07-10T00:00:00Z' }],
          total: 1,
        })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuditPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Overridden')).toBeInTheDocument();
  });

  it('shows the empty state with no entries', async () => {
    server.use(http.get('http://localhost:4000/api/audit', () => HttpResponse.json({ entries: [], total: 0 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuditPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText(/no review decisions/i)).toBeInTheDocument());
  });
});
