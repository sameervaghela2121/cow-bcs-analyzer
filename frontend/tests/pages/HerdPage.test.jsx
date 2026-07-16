import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import HerdPage from '../../src/pages/HerdPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHerd() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HerdPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HerdPage', () => {
  it('renders cows returned by the API', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({
          cows: [
            { cowId: '4417', latestScore: 3.25, latestBand: 'ideal', pen: 'Pen 1', flagged: false, lastScoredAt: '2026-07-10T00:00:00Z' },
            { cowId: '5001', latestScore: 4.5, latestBand: 'heavy', pen: 'Pen 2', flagged: true, lastScoredAt: '2026-07-09T00:00:00Z' },
          ],
          total: 2,
        })
      )
    );
    renderHerd();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Cow 5001')).toBeInTheDocument();
  });

  it('re-fetches with the flagged filter when the Flagged chip is clicked', async () => {
    let lastParams;
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        lastParams = new URL(request.url).searchParams.get('filter');
        return HttpResponse.json({ cows: [], total: 0 });
      })
    );
    renderHerd();
    await waitFor(() => expect(lastParams).toBe(null));
    await userEvent.click(screen.getByText('Flagged'));
    await waitFor(() => expect(lastParams).toBe('flagged'));
  });
});
