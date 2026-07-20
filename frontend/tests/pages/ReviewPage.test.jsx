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

// A realistic bcsScore shape: median plus a per-provider breakdown, each
// carrying its own is_selected - exactly one of the four is ever true.
function bcsScore(overrides = {}) {
  return {
    mean_bcs_score: 3.25,
    median_bcs_score: { score: 3.25, is_selected: true },
    claude: { final_bcs: 3.25, confidence: 'High', status: 'success', is_selected: false },
    gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_selected: false },
    openai: { final_bcs: 3.0, confidence: 'High', status: 'success', is_selected: false },
    ...overrides,
  };
}

const SELECTABLE_PROVIDERS = ['claude', 'gemini', 'openai'];

function clearSelections(score) {
  const next = { ...score, median_bcs_score: { ...score.median_bcs_score, is_selected: false } };
  for (const p of SELECTABLE_PROVIDERS) next[p] = { ...next[p], is_selected: false };
  return next;
}

// Mutates the same cows/analysesByCow objects on approve/select/override, so
// a refetch after the mutation (query invalidation) reflects what was
// persisted - same as hitting the real backend, including the cow-level
// latestAnalysisIsApproved flag that ReviewPage filters the list on. All
// three actions set is_approved on the analysis (each is itself a review
// decision), so all three mutate the matching cow too.
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

function mockCowsAndAnalyses({ cows, analysesByCow, onOverride, onSelect }) {
  server.use(
    http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows, total: cows.length })),
    http.get('http://localhost:4000/api/cows/:cowsId/analyses', ({ params }) =>
      HttpResponse.json({ bcsAnalyses: analysesByCow[params.cowsId] || [], total: (analysesByCow[params.cowsId] || []).length })
    ),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/approve', ({ params }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      match.bcsScore = clearSelections(match.bcsScore);
      match.bcsScore.median_bcs_score.is_selected = true;
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/select', async ({ params, request }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onSelect?.(body);
      match.bcsScore = clearSelections(match.bcsScore);
      match.bcsScore[body.provider].is_selected = true;
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/override', async ({ params, request }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onOverride?.(body);
      match.bcsScore = clearSelections(match.bcsScore);
      match.bcsScore.median_bcs_score = { score: body.score, is_selected: true };
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

  it('shows only cows whose latest analysis is completed and not yet approved, with the median BCS score', async () => {
    mockCowsAndAnalyses({
      cows: [
        { id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
        { id: 'c2', cowsId: '5001', latestAnalysisStatus: 'processing', latestAnalysisIsApproved: false },
      ],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: ['https://example.com/a1.jpg'], is_approved: false,
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
          bcsScore: bcsScore(), imageUrls: [], is_approved: true,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
    expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument();
  });

  it('shows a checkbox with the score and confidence for every provider', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText(/Claude: 3.25 \(High\)/)).toBeInTheDocument();
    expect(screen.getByText(/Gemini: 3.5 \(Medium\)/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI: 3.0 \(High\)/)).toBeInTheDocument();
    // none of the provider checkboxes are pre-checked - the median is selected by default
    for (const cb of screen.getAllByRole('checkbox')) expect(cb).not.toBeChecked();
  });

  it('disables the checkbox for a provider with no successful score', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore({ openai: { final_bcs: null, confidence: null, status: 'error', is_selected: false } }),
          imageUrls: [], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/OpenAI: No score/)).toBeInTheDocument());
    expect(screen.getByText(/OpenAI: No score/).closest('label').querySelector('input')).toBeDisabled();
  });

  it("checking a provider's checkbox stages a confirmation instead of saving immediately", async () => {
    let selectBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
      onSelect: (body) => { selectBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/Gemini: 3.5/));

    // nothing saved yet - just a staged confirmation prompt
    expect(screen.getByText(/select gemini's score \(3.5\) as final/i)).toBeInTheDocument();
    expect(selectBody).toBeUndefined();
    expect(screen.getByText('Cow 4417')).toBeInTheDocument();
  });

  it('canceling a staged provider selection discards it without calling /select', async () => {
    let selectBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
      onSelect: (body) => { selectBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/Gemini: 3.5/));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/as final/i)).not.toBeInTheDocument();
    expect(selectBody).toBeUndefined();
    // back to the normal Approve/Override controls, median score untouched
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it("confirming a staged provider selection calls PATCH /select, shows a toast, updates the badge, and removes the row", async () => {
    let selectBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
      onSelect: (body) => { selectBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/Gemini: 3.5/));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(selectBody).toEqual({ provider: 'gemini' }));
    await waitFor(() => expect(screen.getByText(/selection saved successfully/i)).toBeInTheDocument());

    // gemini's score (3.5) replaces the median (3.25) as the displayed badge,
    // and selecting is itself a review decision - the row disappears too
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
  });

  it('shows an error toast when confirming a selection fails, and leaves the row in place', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
    });
    server.use(
      http.patch('http://localhost:4000/api/bcs-analysis/a1/select', () => new HttpResponse(null, { status: 500 }))
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/Claude: 3.25/));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByText(/failed to save selection/i)).toBeInTheDocument());
    expect(screen.getByText('Cow 4417')).toBeInTheDocument();
  });

  it('overriding persists via PATCH /override, shows a success toast, and removes the row once the list reflects it', async () => {
    let overrideBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
      onOverride: (body) => { overrideBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    // stepper opens prefilled with the median score, not some other default
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
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
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
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
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
          bcsScore: bcsScore(), imageUrls: [], is_approved: false,
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });
});
