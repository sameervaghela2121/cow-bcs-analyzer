import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import HerdPage from '../../src/pages/HerdPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHerd(initialEntries = ['/herd']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/herd" element={<HerdPage />} />
          <Route path="/herd/:cowsId" element={<div>Cow detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function cowsPage(pageNum, total) {
  return { cows: [{ id: `c${pageNum}`, cowsId: `page-${pageNum}-cow` }], total };
}

describe('HerdPage', () => {
  it('renders cows returned by the API', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({
          cows: [
            { id: 'c1', cowsId: '4417' },
            { id: 'c2', cowsId: '5001' },
          ],
          total: 2,
        })
      )
    );
    renderHerd();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Cow 5001')).toBeInTheDocument();
  });

  it('shows the compressed thumbnail as the card cover, falling back to the original on error, or a placeholder with no uploads', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({
          cows: [
            {
              id: 'c1',
              cowsId: '4417',
              latestAnalysisThumbnailUrl: 'https://storage.googleapis.com/300X300/thumb.jpg',
              latestAnalysisImageUrl: 'https://storage.googleapis.com/original.jpg',
            },
            { id: 'c2', cowsId: '5001', latestAnalysisThumbnailUrl: null, latestAnalysisImageUrl: null },
          ],
          total: 2,
        })
      )
    );
    const { container } = renderHerd();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1); // only the cow with a photo renders an <img>
    expect(images[0]).toHaveAttribute('src', 'https://storage.googleapis.com/300X300/thumb.jpg');

    fireEvent.error(images[0]);
    expect(images[0]).toHaveAttribute('src', 'https://storage.googleapis.com/original.jpg');
  });

  it('navigates to the cow detail page using cowsId when a card is clicked', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({ cows: [{ id: 'c1', cowsId: '4417' }], total: 1 })
      )
    );
    renderHerd();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await user.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });

  it('polls every 10s while any cow is still processing, and stops once all have settled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get('http://localhost:4000/api/cows', () => {
        calls += 1;
        const settled = calls >= 3;
        return HttpResponse.json({
          cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: settled ? 'completed' : 'processing' }],
          total: 1,
        });
      })
    );

    renderHerd();
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25000);
    });
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(3));
    const callsAtCompletion = calls;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(calls).toBe(callsAtCompletion);

    vi.useRealTimers();
  });

  it('reads the page number from the URL and requests it from the API', async () => {
    let lastPage;
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        lastPage = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(cowsPage(3, 25)); // 25 total / PAGE_SIZE (10) = 3 pages
      })
    );
    renderHerd(['/herd?page=3']);
    await waitFor(() => expect(lastPage).toBe('3'));
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('clicking Next/Previous updates the URL and refetches that page', async () => {
    const requestedPages = [];
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page')) || 1;
        requestedPages.push(p);
        return HttpResponse.json(cowsPage(p, 25)); // 3 pages
      })
    );
    renderHerd();
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeInTheDocument());
    expect(requestedPages).toContain(2);

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());
  });

  it('resets to page 1 when the search term changes', async () => {
    let lastPage;
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        lastPage = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(cowsPage(1, 40));
      })
    );
    renderHerd(['/herd?page=2']);
    await waitFor(() => expect(lastPage).toBe('2'));
    await userEvent.type(screen.getByPlaceholderText(/search cow id/i), '4417');
    await waitFor(() => expect(lastPage).toBe('1'));
  });

  it('re-fetches with the search term as a query param', async () => {
    let lastSearch;
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        lastSearch = new URL(request.url).searchParams.get('search');
        return HttpResponse.json({ cows: [], total: 0 });
      })
    );
    renderHerd();
    await waitFor(() => expect(lastSearch).toBe(null));
    await userEvent.type(screen.getByPlaceholderText(/search cow id/i), '44');
    await waitFor(() => expect(lastSearch).toBe('44'));
  });
});
