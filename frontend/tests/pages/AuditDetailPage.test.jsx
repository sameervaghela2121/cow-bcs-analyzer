import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuditDetailPage from '../../src/pages/AuditDetailPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit/e1']}>
        <Routes>
          <Route path="/audit" element={<div>Audit list page</div>} />
          <Route path="/audit/:id" element={<AuditDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Row-scoped lookup, since the same number (e.g. a score) can legitimately
// appear in more than one row (Mean/Median/Final BCS Score can all match) -
// a global getByText/getAllByText count would be ambiguous.
function row(label) {
  return within(screen.getByTestId(`audit-diff-row-${label}`));
}

describe('AuditDetailPage', () => {
  it('renders the header, and diffs Approved/Final Score/Model as changed while Mean/Median/Status stay unchanged for an override', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit/e1', () =>
        HttpResponse.json({
          auditLog: {
            id: 'e1',
            cowsId: '4417',
            action: 'overridden',
            before: {
              is_approved: false,
              final_bcs: null,
              status: 'completed',
              updatedBy: 'Original Uploader',
              bcsScore: {
                is_median_true: null, is_mean_true: null,
                claude: { final_bcs: 3.0, status: 'success', is_true: null },
                gemini: { final_bcs: 3.5, status: 'success', is_true: null },
                openai: { final_bcs: 3.0, status: 'success', is_true: null },
              },
            },
            after: {
              is_approved: true,
              final_bcs: 4.0, // a genuine override - doesn't match mean or median below
              status: 'completed',
              updatedBy: 'Reviewer B',
              bcsScore: {
                is_median_true: false, is_mean_true: false,
                claude: { final_bcs: 3.0, status: 'success', is_true: false },
                gemini: { final_bcs: 3.5, status: 'success', is_true: false },
                openai: { final_bcs: 3.0, status: 'success', is_true: false },
              },
            },
            performedBy: { id: 'u-new', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-10T12:00:00Z',
          },
        })
      )
    );
    renderDetail();

    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(screen.getByText(/jane reviewer/i)).toBeInTheDocument();

    // Approved: No -> Yes
    expect(row('Approved').getByText('No')).toBeInTheDocument();
    expect(row('Approved').getByText('Yes')).toBeInTheDocument();

    // Final BCS Score: never measured -> 4.0
    expect(row('Final BCS Score').getByText('—')).toBeInTheDocument();
    expect(row('Final BCS Score').getByText('4.0')).toBeInTheDocument();

    // claude=3.0, gemini=3.5, openai=3.0 -> mean=3.25, median=3.0 - raw
    // provider scores don't change on an override, so both sides match.
    expect(row('Mean').getAllByText('3.25')).toHaveLength(2);
    expect(row('Median').getAllByText('3.0')).toHaveLength(2);

    // Model: nothing measured yet -> a manual override (no model matched)
    expect(row('Model').getByText('Not measured')).toBeInTheDocument();
    expect(row('Model').getByText('None')).toBeInTheDocument();

    // Statistics: same story - the override didn't match mean or median either
    expect(row('Statistics').getByText('Not measured')).toBeInTheDocument();
    expect(row('Statistics').getByText('None')).toBeInTheDocument();

    // Status unchanged - both sides show "completed".
    expect(row('Status').getAllByText('completed')).toHaveLength(2);

    // Last Updated By: differs (uploader before, reviewer after)
    expect(row('Last Updated By').getByText('Original Uploader')).toBeInTheDocument();
    expect(row('Last Updated By').getByText('Reviewer B')).toBeInTheDocument();

    // Photos and error message no longer have dedicated rows.
    expect(screen.queryByText(/photo/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('audit-diff-row-Error Message')).not.toBeInTheDocument();
  });

  it('splits Model and Statistics matches into their own rows for a provider_selected entry', async () => {
    // gemini is the only successful provider - its own score is
    // simultaneously the mean and the median of a one-element set, so
    // selecting it matches all three candidates from a single pick.
    server.use(
      http.get('http://localhost:4000/api/audit/e1', () =>
        HttpResponse.json({
          auditLog: {
            id: 'e1',
            cowsId: '4417',
            action: 'provider_selected',
            before: {
              is_approved: false,
              final_bcs: null,
              bcsScore: {
                is_median_true: null, is_mean_true: null,
                gemini: { final_bcs: 3.5, status: 'success', is_true: null },
                openai: { final_bcs: null, status: 'error', is_true: null },
              },
            },
            after: {
              is_approved: true,
              final_bcs: 3.5,
              bcsScore: {
                is_median_true: true, is_mean_true: true,
                gemini: { final_bcs: 3.5, status: 'success', is_true: true },
                openai: { final_bcs: null, status: 'error', is_true: false },
              },
            },
            performedBy: { id: 'u1', name: 'Jane Reviewer', email: 'jane@example.com' },
            createdAt: '2026-07-10T12:00:00Z',
          },
        })
      )
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Selected')).toBeInTheDocument();

    // Model row only ever lists AI providers, never Mean/Median.
    expect(row('Model').getByText('Not measured')).toBeInTheDocument();
    expect(row('Model').getByText('Gemini')).toBeInTheDocument();

    // Statistics row carries the Mean/Median match separately.
    expect(row('Statistics').getByText('Not measured')).toBeInTheDocument();
    expect(row('Statistics').getByText('Mean, Median')).toBeInTheDocument();

    expect(row('Mean').getAllByText('3.5')).toHaveLength(2);
    expect(row('Median').getAllByText('3.5')).toHaveLength(2);
  });

  it('goes back to the previous page when Back is clicked', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit/e1', () =>
        HttpResponse.json({
          auditLog: {
            id: 'e1',
            cowsId: '4417',
            action: 'provider_selected',
            before: { is_approved: false, final_bcs: null, bcsScore: {} },
            after: { is_approved: true, final_bcs: 3.0, bcsScore: {} },
            performedBy: null,
            createdAt: '2026-07-10T12:00:00Z',
          },
        })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/audit', '/audit/e1']} initialIndex={1}>
          <Routes>
            <Route path="/audit" element={<div>Audit list page</div>} />
            <Route path="/audit/:id" element={<AuditDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText(/^back$/i));
    expect(await screen.findByText(/audit list page/i)).toBeInTheDocument();
  });
});
