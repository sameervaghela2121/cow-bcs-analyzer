import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import ReviewPage from '../../src/pages/ReviewPage.jsx';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReviewPage />
    </QueryClientProvider>
  );
}

// The review queue fetch is temporarily disabled (the backend endpoint was
// removed in the schema overhaul; the page is kept around for later
// rebuild). This just confirms the page renders its empty state and makes
// no network calls in the meantime — onUnhandledRequest: 'error' above
// would fail the test if it tried to hit /api/review/* again.
describe('ReviewPage', () => {
  it('renders the empty state without calling the (disabled) review API', async () => {
    renderReview();
    await waitFor(() => expect(screen.getByText(/queue is clear/i)).toBeInTheDocument());
  });
});
