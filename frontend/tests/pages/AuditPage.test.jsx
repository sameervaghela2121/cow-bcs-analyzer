import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuditPage from '../../src/pages/AuditPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderAudit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit']}>
        <Routes>
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/audit/:id" element={<div>Audit detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AuditPage', () => {
  it('renders an overridden entry, showing the final_bcs before/after change', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{
            id: 'e1',
            cowsId: '4417',
            action: 'overridden',
            before: { final_bcs: 3.5, is_approved: false },
            after: { final_bcs: 3.25, is_approved: true },
            performedBy: { id: 'u1', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-10T00:00:00Z',
          }],
          total: 1,
        })
      )
    );
    renderAudit();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByText('3.5 → 3.25')).toBeInTheDocument();
    expect(screen.getByText(/jane reviewer/i)).toBeInTheDocument();
  });

  it('shows "Median: X" for a provider_selected entry where only the median matched', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{
            id: 'e2',
            cowsId: '5001',
            action: 'provider_selected',
            before: { final_bcs: null, is_approved: false, bcsScore: { is_median_true: null } },
            after: { final_bcs: 3.0, is_approved: true, bcsScore: { is_median_true: true, is_mean_true: false } },
            performedBy: { id: 'u1', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-10T00:00:00Z',
          }],
          total: 1,
        })
      )
    );
    renderAudit();
    await waitFor(() => expect(screen.getByText('Cow 5001')).toBeInTheDocument());
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Median: 3.0')).toBeInTheDocument();
  });

  it('shows which model was picked for a provider_selected entry', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{
            id: 'e3',
            cowsId: '6002',
            action: 'provider_selected',
            before: { final_bcs: 3.0, is_approved: false, bcsScore: { is_median_true: true, gemini: { final_bcs: 3.5, status: 'success', is_true: false } } },
            after: { final_bcs: 3.5, is_approved: true, bcsScore: { is_median_true: false, gemini: { final_bcs: 3.5, status: 'success', is_true: true } } },
            performedBy: { id: 'u1', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-10T00:00:00Z',
          }],
          total: 1,
        })
      )
    );
    renderAudit();
    await waitFor(() => expect(screen.getByText('Cow 6002')).toBeInTheDocument());
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText('Gemini: 3.5')).toBeInTheDocument();
  });

  it('shows the empty state with no entries', async () => {
    server.use(http.get('http://localhost:4000/api/audit', () => HttpResponse.json({ entries: [], total: 0 })));
    renderAudit();
    await waitFor(() => expect(screen.getByText(/no review decisions/i)).toBeInTheDocument());
  });

  it('does not navigate to the detail page when a row is clicked', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{
            id: 'e1',
            cowsId: '4417',
            action: 'provider_selected',
            before: { final_bcs: null, is_approved: false, bcsScore: { is_median_true: null } },
            after: { final_bcs: 3.0, is_approved: true, bcsScore: { is_median_true: true } },
            performedBy: null,
            createdAt: '2026-07-10T00:00:00Z',
          }],
          total: 1,
        })
      )
    );
    renderAudit();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(screen.queryByText(/audit detail page/i)).not.toBeInTheDocument();
  });

  it('shows the date as day-month-year and labels the reviewer as "Edited by"', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{
            id: 'e1',
            cowsId: '4417',
            action: 'overridden',
            before: { final_bcs: 3.5, is_approved: false },
            after: { final_bcs: 3.25, is_approved: true },
            performedBy: { id: 'u1', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-21T00:00:00Z',
          }],
          total: 1,
        })
      )
    );
    renderAudit();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText(/21 july 2026.*edited by jane reviewer/i)).toBeInTheDocument();
  });
});
