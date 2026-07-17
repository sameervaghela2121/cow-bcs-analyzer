import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import ReviewPage from '../../src/pages/ReviewPage.jsx';
import { ToastProvider } from '../../src/components/ToastProvider.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/review']}>
          <Routes>
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/herd/:cowsId" element={<div>Cow detail page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

// Mutates the same cows/analysesByCow objects on approve/override, so a
// refetch after the mutation (query invalidation) reflects what was
// persisted - same as hitting the real backend, including the cow-level
// latestAnalysisIsApproved flag that ReviewPage filters the list on. Both
// approve and override set is_approved on the analysis (overriding is
// itself a review decision), so both mutate the matching cow too.
function findAnalysis(analysesByCow, id) {
  for (const analyses of Object.values(analysesByCow)) {
    const match = analyses.find((a) => a.id === id);
    if (match) return match;
  }
  return null;
}

function markApproved(cows, analysesByCow, match) {
  match.is_approved = true;
  const [cowsId] = Object.entries(analysesByCow).find(([, analyses]) => analyses.includes(match)) || [];
  const cow = cows.find((c) => c.cowsId === cowsId);
  if (cow) cow.latestAnalysisIsApproved = true;
}

function mockCowsAndAnalyses({ cows, analysesByCow, onOverride }) {
  server.use(
    http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows, total: cows.length })),
    http.get('http://localhost:4000/api/cows/:cowsId/analyses', ({ params }) =>
      HttpResponse.json({ bcsAnalyses: analysesByCow[params.cowsId] || [], total: (analysesByCow[params.cowsId] || []).length })
    ),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/approve', ({ params }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/override', async ({ params, request }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onOverride?.(body);
      match.bcsScore = { ...match.bcsScore, mean_bcs_score: body.score };
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    })
  );
}

describe('ReviewPage', () => {
  it('shows the empty state when no cow has a completed analysis', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'processing', latestAnalysisIsApproved: false }],
      analysesByCow: {},
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
  });

  it('shows only cows whose latest analysis is completed and not yet approved, with the mean BCS score', async () => {
    mockCowsAndAnalyses({
      cows: [
        { id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
        { id: 'c2', cowsId: '5001', latestAnalysisStatus: 'processing', latestAnalysisIsApproved: false },
      ],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: ['https://example.com/a1.jpg'], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.queryByText('Cow 5001')).not.toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('does not show a cow whose latest analysis has already been approved', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: true }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [], is_approved: true,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
    expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument();
  });

  it('overriding persists via PATCH /override, shows a success toast, and removes the row once the list reflects it', async () => {
    let overrideBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [], is_approved: false,
        }],
      },
      onOverride: (body) => { overrideBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    // stepper opens prefilled with the mean score, not some other default
    expect(screen.getByText('3.25')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('3.5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(overrideBody).toEqual({ score: 3.5 }));
    await waitFor(() => expect(screen.getByText(/override saved successfully/i)).toBeInTheDocument());

    // overriding is a review decision too - the row disappears from the
    // list the same way an approved one would
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
  });

  it('approving calls PATCH /bcs-analysis/:id/approve, shows a success toast, then the row disappears', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByText(/approved successfully/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
    expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument();
  });

  it('shows an error toast when approving fails', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [], is_approved: false,
        }],
      },
    });
    server.use(
      http.patch('http://localhost:4000/api/bcs-analysis/a1/approve', () => new HttpResponse(null, { status: 500 }))
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(screen.getByText(/failed to approve/i)).toBeInTheDocument());
    // the row is still here - a failed mutation must not remove it
    expect(screen.getByText('Cow 4417')).toBeInTheDocument();
  });

  it('navigates to the cow detail page when a row is clicked', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });
});
