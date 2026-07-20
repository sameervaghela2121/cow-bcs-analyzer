import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import DashboardPage from '../../src/pages/DashboardPage.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Mirrors real backend shape: an approved record's effectiveScore comes
// from final_bcs (the reviewer's decision); an unapproved one falls back to
// the live median preview, computed from whichever providers succeeded -
// here just one, so the median collapses to that single score.
function analysis({ cowsId, meanScore, status = 'completed', isApproved = false }) {
  return {
    id: `${cowsId}-a1`,
    cowsId,
    status,
    is_approved: isApproved,
    final_bcs: isApproved ? meanScore : null,
    bcsScore: isApproved ? {} : { claude: { status: 'success', final_bcs: meanScore } },
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
    updatedBy: 'u1',
  };
}

describe('DashboardPage', () => {
  it('rolls the herd up into KPI tiles and flags out-of-range cows, without touching the backend beyond existing endpoints', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({
          cows: [
            { id: 'c1', cowsId: '1001', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
            { id: 'c2', cowsId: '1002', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: true },
          ],
          total: 2,
        })
      ),
      http.get('http://localhost:4000/api/cows/1001/analyses', () =>
        HttpResponse.json({ bcsAnalyses: [analysis({ cowsId: '1001', meanScore: 2.0, isApproved: false })], total: 1 })
      ),
      http.get('http://localhost:4000/api/cows/1002/analyses', () =>
        HttpResponse.json({ bcsAnalyses: [analysis({ cowsId: '1002', meanScore: 3.5, isApproved: true })], total: 1 })
      )
    );

    renderDashboard();

    // Herd size KPI
    await waitFor(() => expect(screen.getByText('Herd size')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();

    // Cow 1001 (score 2.0, too thin, unapproved) belongs in the attention
    // list; cow 1002 (ideal, already approved) does not.
    await waitFor(() => expect(screen.getByText('Cows Needing Attention')).toBeInTheDocument());
    const attentionCard = screen.getByText('Cows Needing Attention').closest('div');
    expect(within(attentionCard).getByText('Cow 1001')).toBeInTheDocument();
    expect(within(attentionCard).getByText('Too thin')).toBeInTheDocument();
    expect(within(attentionCard).queryByText('Cow 1002')).not.toBeInTheDocument();

    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('renders an empty-state herd without crashing', async () => {
    server.use(http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows: [], total: 0 })));
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Herd size')).toBeInTheDocument());
    expect(screen.getByText('Nothing flagged — herd looks good.')).toBeInTheDocument();
  });
});
