import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { usePollReading } from '../../src/hooks/usePollReading.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function Probe({ readingId }) {
  const { reading, isDone } = usePollReading(readingId);
  return <div>{isDone ? `done:${reading?.status}` : 'polling'}</div>;
}

function renderProbe(readingId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe readingId={readingId} />
    </QueryClientProvider>
  );
}

describe('usePollReading', () => {
  it('keeps polling while status is processing, then stops once scored', async () => {
    let callCount = 0;
    server.use(
      http.get('http://localhost:4000/api/readings/r1', () => {
        callCount += 1;
        const status = callCount < 2 ? 'processing' : 'scored';
        return HttpResponse.json({ reading: { id: 'r1', status, score: status === 'scored' ? 3.25 : null } });
      })
    );
    renderProbe('r1');
    await waitFor(() => expect(screen.getByText('done:scored')).toBeInTheDocument(), { timeout: 5000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
