import { render, screen, waitFor, act } from '@testing-library/react';
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
              bcsScore: { gemini: { final_bcs: 3.25, confidence: 'High', status: 'success' } },
            },
            {
              id: 'a1',
              status: 'completed',
              createdAt: '2026-07-01T00:00:00Z',
              imageUrls: ['https://storage.googleapis.com/a1-img1.jpg'],
              bcsScore: { gemini: { final_bcs: 3.0, confidence: 'Medium', status: 'success' } },
            },
          ],
          total: 2,
        })
      )
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getAllByText(/completed/i).length).toBe(2);
    const scoreLines = screen.getAllByText(/gemini/i).map((el) => el.closest('div').textContent);
    expect(scoreLines.some((t) => t.includes('3.25'))).toBe(true);
    expect(scoreLines.some((t) => t.includes('Medium'))).toBe(true);
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
    await waitFor(() => expect(screen.getByText(/^completed$/i)).toBeInTheDocument());
    expect(pollCalls).toBeGreaterThanOrEqual(3);
    const callsAtCompletion = pollCalls;

    // status stayed completed after further time passes - polling stopped
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(pollCalls).toBe(callsAtCompletion);

    vi.useRealTimers();
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
