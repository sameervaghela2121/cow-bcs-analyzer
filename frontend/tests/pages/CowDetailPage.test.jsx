import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import CowDetailPage from '../../src/pages/CowDetailPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/herd/4417']}>
        <Routes>
          <Route path="/herd/:cowsId" element={<CowDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Simulates arriving here from wherever the user actually came from - Review,
// not always Herd - by seeding two history entries and landing on the second.
function renderDetailArrivingFrom(previousPath) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[previousPath, '/herd/4417']} initialIndex={1}>
        <Routes>
          <Route path="/review" element={<div>Review page</div>} />
          <Route path="/herd" element={<div>Herd page</div>} />
          <Route path="/herd/:cowsId" element={<CowDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CowDetailPage', () => {
  it('renders the cow and its analysis history, most recent first', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () =>
        HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })
      ),
      http.get('http://localhost:4000/api/cows/4417/analyses', () =>
        HttpResponse.json({
          bcsAnalyses: [
            {
              id: 'a2',
              status: 'completed',
              createdAt: '2026-07-10T00:00:00Z',
              imageUrls: ['https://storage.googleapis.com/a2-img1.jpg'],
              final_bcs: null,
              medianScore: 3.25,
              bcsScore: {
                gemini: { final_bcs: 3.25, confidence: 'High', status: 'success' },
                claude: { final_bcs: 3.0, confidence: 'Medium', status: 'success' },
              },
            },
            {
              id: 'a1',
              status: 'completed',
              createdAt: '2026-07-01T00:00:00Z',
              imageUrls: ['https://storage.googleapis.com/a1-img1.jpg'],
              final_bcs: 3.0,
              medianScore: 3.0,
              bcsScore: { gemini: { final_bcs: 3.0, confidence: 'Medium', status: 'success' } },
            },
          ],
          total: 2,
        })
      )
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    // Scoped to each card's own status line (via testid) rather than a page-wide
    // text search, since the stats bar above also renders a "Completed" label.
    const statusEls = screen.getAllByTestId('analysis-status');
    expect(statusEls).toHaveLength(2);
    expect(statusEls.every((el) => /completed/i.test(el.textContent))).toBe(true);
    // Shows the single overall score (final_bcs once reviewed, medianScore
    // as a live preview before that), not a per-provider breakdown.
    expect(screen.getByText('3.25')).toBeInTheDocument();
    expect(screen.getByText('3.0')).toBeInTheDocument();
    // The cow detail page (unlike ReviewPage) does show each model's raw
    // score, alongside "No score" for whichever provider didn't run.
    expect(screen.getByText('Gemini: 3.25')).toBeInTheDocument();
    expect(screen.getByText('Claude: 3.0')).toBeInTheDocument();
    expect(screen.getAllByText('OpenAI: No score')).toHaveLength(2);
  });

  it('polls a pending analysis every 10s and stops once it completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let pollCalls = 0;

    server.use(
      http.get('http://localhost:4000/api/cows/4417', () =>
        HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })
      ),
      http.get('http://localhost:4000/api/cows/4417/analyses', () =>
        HttpResponse.json({
          bcsAnalyses: [
            { id: 'a3', status: 'not_started', createdAt: '2026-07-16T00:00:00Z', imageUrls: [], bcsScore: {} },
          ],
          total: 1,
        })
      ),
      http.get('http://localhost:4000/api/bcs-analysis/a3', () => {
        pollCalls += 1;
        const done = pollCalls >= 3;
        return HttpResponse.json({
          bcsAnalysis: {
            id: 'a3',
            status: done ? 'completed' : 'processing',
            imageUrls: [],
            final_bcs: null,
            medianScore: done ? 3.5 : null,
            bcsScore: done ? { gemini: { final_bcs: 3.5, confidence: 'High', status: 'success' } } : {},
          },
        });
      })
    );

    renderDetail();
    await waitFor(() => expect(screen.getByText(/waiting to start|processing/i)).toBeInTheDocument());

    // Enough 10s intervals for the row to reach 'completed' (mount fetch + 2 refetches).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });
    // Scoped to the card's status line (via testid), since the stats bar
    // also renders a "Completed" label elsewhere on the page.
    await waitFor(() => expect(screen.getByTestId('analysis-status')).toHaveTextContent(/^completed$/i));
    expect(pollCalls).toBeGreaterThanOrEqual(3);
    const callsAtCompletion = pollCalls;

    // status stayed completed after further time passes - polling stopped
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(pollCalls).toBe(callsAtCompletion);

    vi.useRealTimers();
  });

  it('shows one cover photo with a "+N" badge, and opens a full-screen gallery on click', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () => HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })),
      http.get('http://localhost:4000/api/cows/4417/analyses', () =>
        HttpResponse.json({
          bcsAnalyses: [
            {
              id: 'a1',
              status: 'completed',
              createdAt: '2026-07-10T00:00:00Z',
              imageUrls: [
                'https://storage.googleapis.com/img1.jpg',
                'https://storage.googleapis.com/img2.jpg',
                'https://storage.googleapis.com/img3.jpg',
              ],
              final_bcs: null,
              medianScore: 3.25,
              bcsScore: {},
            },
          ],
          total: 1,
        })
      )
    );
    const { container } = renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    // Only the first photo shows as a thumbnail, with a badge for the other
    // two. alt="" images are decorative, so they carry an implicit
    // "presentation" role rather than "img" - querying raw <img> tags
    // instead of screen.getAllByRole('img').
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('1 / 3')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View 3 photos' }));

    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    // Two <img> elements now exist (the thumbnail plus the lightbox's own) -
    // the lightbox's is the last one rendered.
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect([...container.querySelectorAll('img')].at(-1)).toHaveAttribute('src', 'https://storage.googleapis.com/img1.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect([...container.querySelectorAll('img')].at(-1)).toHaveAttribute('src', 'https://storage.googleapis.com/img2.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    // Wraps around backward from the first photo to the last.
    await userEvent.click(screen.getByRole('button', { name: 'Previous image' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('1 / 3')).not.toBeInTheDocument();
    expect(screen.queryByText('3 / 3')).not.toBeInTheDocument();
  });

  it('groups upload history cards by day, with same-day records sharing one row', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () => HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })),
      http.get('http://localhost:4000/api/cows/4417/analyses', () =>
        HttpResponse.json({
          bcsAnalyses: [
            { id: 'a3', status: 'completed', createdAt: '2026-07-16T15:00:00Z', imageUrls: ['https://storage.googleapis.com/a3.jpg'], final_bcs: null, medianScore: 3.0, bcsScore: {} },
            { id: 'a2', status: 'completed', createdAt: '2026-07-16T09:00:00Z', imageUrls: ['https://storage.googleapis.com/a2.jpg'], final_bcs: null, medianScore: 3.25, bcsScore: {} },
            { id: 'a1', status: 'completed', createdAt: '2026-07-10T09:00:00Z', imageUrls: ['https://storage.googleapis.com/a1.jpg'], final_bcs: null, medianScore: 2.75, bcsScore: {} },
          ],
          total: 3,
        })
      )
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    // One date heading per distinct day, not one per record - the two Jul 16
    // records share a single heading and sit in the same row. Checked via the
    // day-heading testid rather than plain text, since each card also shows
    // its own date badge (and the stats bar's "Last Scan" tile repeats the
    // newest date too) - all of which would otherwise also match "Jul 16, 2026".
    const historySection = screen.getByTestId('upload-history-groups');
    const headings = within(historySection).getAllByTestId('day-heading').map((el) => el.textContent);
    expect(headings).toEqual(['Jul 16, 2026', 'Jul 10, 2026']);

    // All three cards still render, each independently clickable.
    expect(screen.getAllByRole('button', { name: /view 1 photo/i })).toHaveLength(3);
  });

  it('prefers the 600X600 display variant for the card cover (sharper than upscaling the 300X300 thumbnail), falling back to the original on error', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () => HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })),
      http.get('http://localhost:4000/api/cows/4417/analyses', () =>
        HttpResponse.json({
          bcsAnalyses: [
            {
              id: 'a1',
              status: 'completed',
              createdAt: '2026-07-10T00:00:00Z',
              imageUrls: ['https://storage.googleapis.com/original.jpg'],
              thumbnailUrls: ['https://storage.googleapis.com/300X300/thumb.jpg'],
              displayUrls: ['https://storage.googleapis.com/600X600/display.jpg'],
              final_bcs: null,
              medianScore: 3.25,
              bcsScore: {},
            },
          ],
          total: 1,
        })
      )
    );
    const { container } = renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    // Cover uses the compressed 600X600 display variant, not the original.
    const coverImg = container.querySelector('img');
    expect(coverImg).toHaveAttribute('src', 'https://storage.googleapis.com/600X600/display.jpg');

    // A load failure on the variant falls back to the original.
    fireEvent.error(coverImg);
    expect(coverImg).toHaveAttribute('src', 'https://storage.googleapis.com/original.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'View 1 photo' }));

    // Lightbox uses the compressed 600X600 display variant, not the original.
    const lightboxImg = [...container.querySelectorAll('img')].at(-1);
    expect(lightboxImg).toHaveAttribute('src', 'https://storage.googleapis.com/600X600/display.jpg');

    // A load failure on the display variant falls back to the original.
    fireEvent.error(lightboxImg);
    expect(lightboxImg).toHaveAttribute('src', 'https://storage.googleapis.com/original.jpg');
  });

  it('back goes to wherever the user actually came from, not always /herd', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () => HttpResponse.json({ cow: { id: 'c1', cowsId: '4417' } })),
      http.get('http://localhost:4000/api/cows/4417/analyses', () => HttpResponse.json({ bcsAnalyses: [], total: 0 }))
    );
    renderDetailArrivingFrom('/review');
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    await userEvent.click(screen.getByText(/^back$/i));
    expect(await screen.findByText('Review page')).toBeInTheDocument();
  });
});
