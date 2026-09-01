import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import ReviewPage from '../../src/pages/ReviewPage.jsx';
import { ToastProvider } from '../../src/components/ToastProvider.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';

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
          <AuthProvider>
            <Routes>
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/herd/:cowsId" element={<div>Cow detail page</div>} />
            </Routes>
          </AuthProvider>
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
    cowsId: '4417',
    createdAt: '2026-07-10T00:00:00Z',
    status: 'completed',
    isApproved: false,
    imageUrls: ['https://example.com/a1.jpg'],
    finalBcs: null,
    meanScore: 3.25,
    medianScore: 3.25,
    bcsScore: {
      claude: { finalBcs: 3.25, confidence: 'High', status: 'success', isTrue: null },
      gemini: { finalBcs: 3.5, confidence: 'Medium', status: 'success', isTrue: null },
      openai: { finalBcs: 3.0, confidence: 'High', status: 'success', isTrue: null },
      isMeanAccurate: null,
      isMedianAccurate: null,
      isCritical: false,
    },
    ...overrides,
  };
}

function candidateValueForTest(analysis, source) {
  if (source === 'mean') return analysis.meanScore;
  if (source === 'median') return analysis.medianScore;
  return analysis.bcsScore?.[source]?.finalBcs ?? null;
}

// GET /pending-review filters status==='completed' && !isApproved server-side
// (see bcsAnalysisController.pendingReview) - the mock reproduces that
// filtering rather than trusting the frontend to do it, so these tests catch
// a regression to the old "fetch everything, filter client-side" bug the
// same way the real backend would: an analysis this mock wouldn't return is
// an analysis ReviewPage never even learns about.
function mockPendingReview(analyses, { onSelect, onOverride, onListFetch } = {}) {
  server.use(
    http.get('http://localhost:4000/api/bcs-analysis/pending-review', () => {
      onListFetch?.();
      const pending = analyses.filter((a) => a.status === 'completed' && !a.isApproved);
      return HttpResponse.json({ bcsAnalyses: pending, total: pending.length });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/select', async ({ params, request }) => {
      const match = analyses.find((a) => a.id === params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onSelect?.(body);
      match.finalBcs = candidateValueForTest(match, body.source);
      match.isApproved = true;
      return HttpResponse.json({ bcsAnalysis: match });
    }),
    http.patch('http://localhost:4000/api/bcs-analysis/:id/override', async ({ params, request }) => {
      const match = analyses.find((a) => a.id === params.id);
      if (!match) return new HttpResponse(null, { status: 404 });
      const body = await request.json();
      onOverride?.(body);
      match.finalBcs = body.score;
      match.isApproved = true;
      return HttpResponse.json({ bcsAnalysis: match });
    })
  );
}

describe('ReviewPage', () => {
  it('shows the empty state when no analysis is completed', async () => {
    mockPendingReview([makeAnalysis({ status: 'processing' })]);
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
  });

  it('shows only analyses that are completed and not yet approved, previewing the median as the badge', async () => {
    mockPendingReview([
      makeAnalysis({ id: 'a1', cowsId: '4417' }),
      makeAnalysis({ id: 'a2', cowsId: '5001', status: 'processing' }),
    ]);
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.queryByText('Cow 5001')).not.toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('does not show an analysis that has already been approved', async () => {
    mockPendingReview([makeAnalysis({ isApproved: true, finalBcs: 3.25 })]);
    renderReview();
    await waitFor(() => expect(screen.getByText(/nothing waiting for review/i)).toBeInTheDocument());
    expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument();
  });

  it('shows a chip for every candidate - each provider plus the live-computed mean and median', async () => {
    mockPendingReview([makeAnalysis()]);
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
    mockPendingReview([
      makeAnalysis({
        bcsScore: {
          claude: { finalBcs: 3.25, confidence: 'High', status: 'success', isTrue: null },
          gemini: { finalBcs: 3.5, confidence: 'Medium', status: 'success', isTrue: null },
          openai: { finalBcs: null, confidence: null, status: 'error', isTrue: null },
          isMeanAccurate: null, isMedianAccurate: null, isCritical: false,
        },
      }),
    ]);
    renderReview();
    await waitFor(() => expect(screen.getByText('OpenAI: No score')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'OpenAI: No score' })).toBeDisabled();
  });

  it('clicking one candidate highlights every other candidate sharing its exact value', async () => {
    // claude=3.0, gemini=3.5, openai=3.0 -> mean=3.25, median=3.0 (middle of
    // [3.0, 3.0, 3.5]) - claude, openai, and median all coincide at 3.0.
    mockPendingReview([
      makeAnalysis({
        meanScore: 3.25,
        medianScore: 3.0,
        bcsScore: {
          claude: { finalBcs: 3.0, confidence: 'High', status: 'success', isTrue: null },
          gemini: { finalBcs: 3.5, confidence: 'Medium', status: 'success', isTrue: null },
          openai: { finalBcs: 3.0, confidence: 'High', status: 'success', isTrue: null },
          isMeanAccurate: null, isMedianAccurate: null, isCritical: false,
        },
      }),
    ]);
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
    mockPendingReview([makeAnalysis()]);
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
    mockPendingReview([makeAnalysis()], { onSelect: (body) => { selectBody = body; } });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Gemini: 3.5' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(selectBody).toEqual({ source: 'gemini' }));
    await waitFor(() => expect(screen.getByText(/review submitted successfully/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
  });

  it('removes a saved row from the cache immediately, without refetching the list', async () => {
    // Regression test for the "row stays for a second, then vanishes" glitch:
    // the old code called invalidateQueries on success, which marks the list
    // stale and refetches it - the row only disappeared once that second
    // request resolved. ReviewPage now updates the cached list directly from
    // the mutation's own response, so GET /pending-review must fire exactly
    // once (the initial page load) even after a successful Save.
    let listFetchCount = 0;
    mockPendingReview([makeAnalysis()], { onListFetch: () => { listFetchCount += 1; } });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(listFetchCount).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Claude: 3.25' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await waitFor(() => expect(screen.queryByText('Cow 4417')).not.toBeInTheDocument());
    expect(listFetchCount).toBe(1);
  });

  it('shows an error toast when Save fails, and leaves the row in place', async () => {
    mockPendingReview([makeAnalysis()]);
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
    mockPendingReview([makeAnalysis()], { onOverride: (body) => { overrideBody = body; } });
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
    mockPendingReview([makeAnalysis()]);
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
    mockPendingReview([makeAnalysis()], { onOverride: (body) => { overrideBody = body; } });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(overrideBody).toBeUndefined();
    expect(screen.getByRole('button', { name: /override/i })).toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('shows an error toast when overriding fails', async () => {
    mockPendingReview([makeAnalysis()]);
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

  it('loads the compressed thumbnail for the row tile, not the full original', async () => {
    // Regression test: the row tile is 58x58px, same as HerdPage's cover
    // photo - it should request thumbnailUrls (the 300x300 compressed
    // variant), not imageUrls (the full original), the same way
    // HerdPage/CowDetailPage already do for their own image tiles.
    mockPendingReview([
      makeAnalysis({ thumbnailUrls: ['https://example.com/a1-thumb.jpg'] }),
    ]);
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    const img = screen.getByAltText('');
    expect(img).toHaveAttribute('src', 'https://example.com/a1-thumb.jpg');
  });

  it('falls back to the full original image if the thumbnail variant fails to load', async () => {
    mockPendingReview([
      makeAnalysis({ thumbnailUrls: ['https://example.com/a1-thumb.jpg'] }),
    ]);
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    const img = screen.getByAltText('');
    img.dispatchEvent(new Event('error'));
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://example.com/a1.jpg'));
  });

  it('navigates to the cow detail page when a row is clicked', async () => {
    mockPendingReview([makeAnalysis()]);
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });

  it('surfaces a review whose cow was registered long before the herd list would ever page to it', async () => {
    // Regression test for the bug this endpoint replaced: the old ReviewPage
    // fetched GET /cows (paginated by cow.createdAt, newest first) and
    // filtered client-side, so a pending review on an old cow outside that
    // page never appeared no matter its isApproved value. pending-review
    // queries BcsAnalysis directly, so an old cow's pending review shows up
    // exactly like a new one's - there is no page to fall outside of.
    mockPendingReview([
      makeAnalysis({ id: 'old1', cowsId: '1001', createdAt: '2020-01-01T00:00:00Z' }),
    ]);
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 1001')).toBeInTheDocument());
  });
});
