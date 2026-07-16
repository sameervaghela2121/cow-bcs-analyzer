import { render, screen, waitFor } from '@testing-library/react';
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
          <Route path="/herd/:cowId" element={<CowDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CowDetailPage', () => {
  it('renders cow metadata and reading history', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () =>
        HttpResponse.json({ cow: { cowId: '4417', breed: 'Holstein', lactation: 'Mid', pen: 'Pen 1', latestScore: 3.25, latestBand: 'ideal' } })
      ),
      http.get('http://localhost:4000/api/cows/4417/readings', () =>
        HttpResponse.json({
          readings: [
            { id: 'r1', score: 3.25, confidence: 'high', band: 'ideal', capturedAt: '2026-07-10T00:00:00Z', flagged: false },
            { id: 'r2', score: 3.5, confidence: 'medium', band: 'ideal', capturedAt: '2026-07-01T00:00:00Z', flagged: false },
          ],
          total: 2,
        })
      ),
      http.get('http://localhost:4000/api/readings/r1/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0))),
      http.get('http://localhost:4000/api/readings/r2/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0)))
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Holstein')).toBeInTheDocument();
    expect(screen.getAllByText(/confirmed/i).length + screen.getAllByText(/high|medium/i).length).toBeGreaterThan(0);
  });
});
