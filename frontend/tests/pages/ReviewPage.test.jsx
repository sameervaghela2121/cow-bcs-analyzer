import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import ReviewPage from '../../src/pages/ReviewPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/review']}>
        <Routes>
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/herd/:cowsId" element={<div>Cow detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function mockCowsAndAnalyses({ cows, analysesByCow }) {
  server.use(
    http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows, total: cows.length })),
    http.get('http://localhost:4000/api/cows/:cowsId/analyses', ({ params }) =>
      HttpResponse.json({ bcsAnalyses: analysesByCow[params.cowsId] || [], total: (analysesByCow[params.cowsId] || []).length })
    )
  );
}

describe('ReviewPage', () => {
  it('shows the empty state when no cow has a completed analysis', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'processing' }],
      analysesByCow: {},
    });
    renderReview();
    await waitFor(() => expect(screen.getByText(/no completed analyses/i)).toBeInTheDocument());
  });

  it('shows only cows whose latest analysis is completed, with the mean BCS score', async () => {
    mockCowsAndAnalyses({
      cows: [
        { id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed' },
        { id: 'c2', cowsId: '5001', latestAnalysisStatus: 'processing' },
      ],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: ['https://example.com/a1.jpg'],
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.queryByText('Cow 5001')).not.toBeInTheDocument();
    expect(screen.getByText('3.25')).toBeInTheDocument();
  });

  it('prefills the override stepper with the mean BCS score, and confirming updates the displayed badge locally', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed' }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [],
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('3.25')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    // stepper opens prefilled with the mean score, not some other default
    expect(screen.getByText('3.25')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('3.5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(screen.getByText('3.5')).toBeInTheDocument();
    expect(screen.getByText(/overridden from 3.25/i)).toBeInTheDocument();
  });

  it('navigates to the cow detail page when a row is clicked', async () => {
    mockCowsAndAnalyses({
      cows: [{ id: 'c1', cowsId: '4417', latestAnalysisStatus: 'completed' }],
      analysesByCow: {
        4417: [{
          id: 'a1', createdAt: '2026-07-10T00:00:00Z', status: 'completed',
          bcsScore: { mean_bcs_score: 3.25 }, imageUrls: [],
        }],
      },
    });
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Cow 4417'));
    expect(await screen.findByText(/cow detail page/i)).toBeInTheDocument();
  });
});
