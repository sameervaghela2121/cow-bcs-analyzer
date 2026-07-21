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

// meanScore/medianScore are computed server-side and returned as top-level
// fields on the analysis (see backend/src/controllers/bcsAnalysisController
// serializeBcsAnalysis) - claude=3.25, gemini=3.5, openai=3.0 gives
// mean=3.25, median=3.25 (deliberately equal here so the "no candidate
// clicked yet" preview badge has one unambiguous expected value).
function makeAnalysis(overrides = {}) {
  return {
    id: 'a1',
    createdAt: '2026-07-10T00:00:00Z',
    status: 'completed',
    is_approved: false,
    imageUrls: ['https://example.com/a1.jpg'],
    final_bcs: null,
    meanScore: 3.25,
    medianScore: 3.25,
    bcsScore: {
      claude: { final_bcs: 3.25, confidence: 'High', status: 'success', is_true: null },
      gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_true: null },
      openai: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
      is_mean_true: null,
      is_median_true: null,
      is_critical: false,
    },
    ...overrides,
  };
}

// Mutates the same cows/analysesByCow objects on select/override, so a
// refetch after the mutation (query invalidation) reflects what was
// persisted - same as hitting the real backend, including the cow-level
// latestAnalysisIsApproved flag that ReviewPage filters the list on. Both
// actions set is_approved on the analysis (each is itself a final review
// decision), so both mutate the matching cow too.
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
    http.patch('http://localhost:4000/api/bcs-analysis/:id/select', async ({ params, request }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onSelect?.(body);
      match.final_bcs = candidateValueForTest(match, body.source);
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/override', async ({ params, request }) => {
      const match = findAnalysis(analysesByCow, params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onOverride?.(body);
      match.final_bcs = body.score;
      markApproved(cows, analysesByCow, match);
      return HttpResponse.json({ bcsAnalysis: match });
    })
  );
}

function candidateValueForTest(analysis, source) {
  if (source === 'mean') return analysis.meanScore;
  if (source === 'median') return analysis.medianScore;
  return analysis.bcsScore?.[source]?.final_bcs ?? null;
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

  it('shows only cows whose latest analysis is completed and not yet approved, previewing the median as the badge', async () => {
    mockCowsAndAnalyses({
      cows: [
        { id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false },
        { id: 'c2', cowsId: '5001', latestAnalysisStatus: 'processing', latestAnalysisIsApproved: false },
      ],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.queryByText('Cow 5001')).not.toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('does not show a cow whose latest analysis has already been approved', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: true }],
      analysesByCow: { 4417: [makeAnalysis({ is_approved: true, final_bcs: 3.25 })] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
    expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument();
  });

  it('shows a chip for every candidate - each provider plus the live-computed mean and median', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Claude: 3.25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gemini: 3.5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OpenAI: 3.0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mean: 3.25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Median: 3.25' })).toBeInTheDocument();
    // nothing is pre-selected - the reviewer must actively click a candidate
    for (const btn of screen.getAllByRole('button', { pressed: false })) {
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('disables the chip for a provider with no successful score', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [makeAnalysis({
          bcsScore: {
            claude: { final_bcs: 3.25, confidence: 'High', status: 'success', is_true: null },
            gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_true: null },
            openai: { final_bcs: null, confidence: null, status: 'error', is_true: null },
            is_mean_true: null, is_median_true: null, is_critical: false,
          },
        })],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('OpenAI: No score')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'OpenAI: No score' })).toBeDisabled();
  });

  it('clicking one candidate highlights every other candidate sharing its exact value', async () => {
    // claude=3.0, gemini=3.5, openai=3.0 -> mean=3.25, median=3.0 (middle of
    // [3.0, 3.0, 3.5]) - claude, openai, and median all coincide at 3.0.
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: {
        4417: [makeAnalysis({
          meanScore: 3.25,
          medianScore: 3.0,
          bcsScore: {
            claude: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
            gemini: { final_bcs: 3.5, confidence: 'Medium', status: 'success', is_true: null },
            openai: { final_bcs: 3.0, confidence: 'High', status: 'success', is_true: null },
            is_mean_true: null, is_median_true: null, is_critical: false,
          },
        })],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Claude: 3.0' }));

    expect(screen.getByRole('button', { name: 'Claude: 3.0' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'OpenAI: 3.0' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Median: 3.0' })).toHaveAttribute('aria-pressed', 'true');
    // gemini (3.5) and mean (3.25) don't match 3.0
    expect(screen.getByRole('button', { name: 'Gemini: 3.5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Mean: 3.25' })).toHaveAttribute('aria-pressed', 'false');
    // the badge previews the clicked value
    expect(screen.getByText('3.0')).toBeInTheDocument();
  });

  it('clicking an already-selected candidate again deselects it, reverting the preview to the median', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Gemini: 3.5' }));
    expect(screen.getByRole('button', { name: 'Gemini: 3.5' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Save/ })).not.toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Gemini: 3.5' }));
    expect(screen.getByRole('button', { name: 'Gemini: 3.5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();
    expect(screen.getByText('3.25')).toBeInTheDocument(); // back to the median preview
  });

  it('Save is disabled until a candidate is picked, then calls PATCH /select with the clicked source', async () => {
    let selectBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
      onSelect: (body) => { selectBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Gemini: 3.5' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(selectBody).toEqual({ source: 'gemini' }));
    await waitFor(() => expect(screen.getByText(/review submitted successfully/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
  });

  it('shows an error toast when Save fails, and leaves the row in place', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    server.use(
      http.patch('http://localhost:4000/api/bcs-analysis/a1/select', () => new HttpResponse(null, { status: 500 }))
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Claude: 3.25' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    // Matches only the toast ("please try again."), not the row's own
    // shorter inline error text ("try again." without "please") - both
    // start with "Failed to submit", so an unanchored /failed to submit/i
    // would be ambiguous between the two.
    await waitFor(() => expect(screen.getByText(/failed to submit - please try again/i)).toBeInTheDocument());
    expect(screen.getByText('Cow 4417')).toBeInTheDocument();
  });

  it('overriding opens a stepper prefilled with the median preview, then calls PATCH /override', async () => {
    let overrideBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
      onOverride: (body) => { overrideBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    // stepper opens prefilled with the median score, not some other default
    expect(screen.getByText('3.25')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('3.5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(overrideBody).toEqual({ score: 3.5 }));
    await waitFor(() => expect(screen.getByText(/override saved successfully/i)).toBeInTheDocument());

    // overriding is a review decision too - the row disappears from the
    // list the same way a saved selection would
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
  });

  it('pressing Override deselects any previously-checked candidate chips, since overriding means agreeing with none of them', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    // makeAnalysis() has claude=mean=median=3.25, so clicking Claude checks
    // all three chips at once (they coincide) - Override should clear all of them.
    await userEvent.click(screen.getByRole('button', { name: 'Claude: 3.25' }));
    expect(screen.getByRole('button', { name: 'Claude: 3.25' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mean: 3.25' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Median: 3.25' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: /override/i }));

    expect(screen.getByRole('button', { name: 'Claude: 3.25' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Mean: 3.25' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Median: 3.25' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('canceling an override discards it without calling PATCH /override', async () => {
    let overrideBody;
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
      onOverride: (body) => { overrideBody = body; },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(overrideBody).toBeUndefined();
    expect(screen.getByRole('button', { name: /override/i })).toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('shows an error toast when overriding fails', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    server.use(
      http.patch('http://localhost:4000/api/bcs-analysis/a1/override', () => new HttpResponse(null, { status: 500 }))
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByText(/failed to save override/i)).toBeInTheDocument());
    expect(screen.getByText('Cow 4417')).toBeInTheDocument();
  });

  it('navigates to the cow detail page when a row is clicked', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed', latestAnalysisIsApproved: false }],
      analysesByCow: { 4417: [makeAnalysis()] },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });
});
