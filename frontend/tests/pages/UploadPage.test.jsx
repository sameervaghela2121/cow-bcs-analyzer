import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UploadPage from '../../src/pages/UploadPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderUpload() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UploadPage', () => {
  it('blocks upload until a Cow ID is entered', async () => {
    renderUpload();
    const file = new File(['fake-bytes'], 'cow.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    await userEvent.upload(input, file);
    expect(screen.getByText(/enter a cow id/i)).toBeInTheDocument();
  });

  it('uploads and shows the scored result once processing completes', async () => {
    server.use(
      http.post('http://localhost:4000/api/readings', () => HttpResponse.json({ readingId: 'r1', status: 'processing' }, { status: 202 })),
      http.get('http://localhost:4000/api/readings/r1', () =>
        HttpResponse.json({ reading: { id: 'r1', status: 'scored', score: 3.25, confidence: 'high', band: 'ideal', flagged: false } })
      )
    );
    renderUpload();
    await userEvent.type(screen.getByLabelText(/cow id/i), '4417');
    const file = new File(['fake-bytes'], 'cow.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText(/reading saved/i)).toBeInTheDocument(), { timeout: 5000 });
  });
});
