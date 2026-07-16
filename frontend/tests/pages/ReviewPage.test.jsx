import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <ReviewPage />
    </QueryClientProvider>
  );
}

function baseQueueItem() {
  return {
    id: 'r1', cowId: '4417', score: 3.0, confidence: 'low', flagReason: 'Only one model produced a score.',
    capturedAt: '2026-07-10T00:00:00Z', reviewStatus: 'pending',
  };
}

describe('ReviewPage', () => {
  it('renders the queue and approves an item', async () => {
    let approveCalled = false;
    server.use(
      http.get('http://localhost:4000/api/review/queue', () => HttpResponse.json({ items: [baseQueueItem()] })),
      http.get('http://localhost:4000/api/readings/r1/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0))),
      http.post('http://localhost:4000/api/review/r1/approve', () => { approveCalled = true; return HttpResponse.json({ ok: true }); })
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(approveCalled).toBe(true));
  });

  it('opens the override stepper and submits a new score', async () => {
    let overrideBody;
    server.use(
      http.get('http://localhost:4000/api/review/queue', () => HttpResponse.json({ items: [baseQueueItem()] })),
      http.get('http://localhost:4000/api/readings/r1/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0))),
      http.post('http://localhost:4000/api/review/r1/override', async ({ request }) => {
        overrideBody = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );
    renderReview();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /override/i }));
    await userEvent.click(screen.getByRole('button', { name: '+' }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await waitFor(() => expect(overrideBody).toEqual({ score: 3.25 }));
  });

  it('shows the empty state when the queue is clear', async () => {
    server.use(http.get('http://localhost:4000/api/review/queue', () => HttpResponse.json({ items: [] })));
    renderReview();
    await waitFor(() => expect(screen.getByText(/queue is clear/i)).toBeInTheDocument());
  });
});
