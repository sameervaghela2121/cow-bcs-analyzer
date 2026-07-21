import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UploadPage from '../../src/pages/UploadPage.jsx';

// Default handler for the cow-ID search-as-you-type lookup so tests that
// don't care about it (most of them) don't trip the strict
// onUnhandledRequest: 'error' setting below.
const server = setupServer(
  http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows: [], total: 0 }))
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderUpload() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/upload']}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/herd" element={<div>Herd page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  // The file input is deliberately `pointer-events: none` (clicks are meant
  // to be delegated from the surrounding drop-zone div, not the input
  // itself), so userEvent's default pointer-interaction check must be off
  // for `.upload()` to work on it directly.
  return userEvent.setup({ pointerEventsCheck: 0 });
}

describe('UploadPage', () => {
  it('blocks upload until a Cow ID is entered', async () => {
    const user = renderUpload();
    const file = new File(['fake-bytes'], 'cow.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload photos/i }));
    expect(screen.getByText(/enter a cow id/i)).toBeInTheDocument();
  });

  it('uploads a batch of photos straight to GCS, creates one analysis record, triggers analysis, and navigates to the herd page', async () => {
    let uploadUrlCalls = 0;
    let putCalls = 0;
    let createCalls = 0;
    let analyzeCalls = 0;

    server.use(
      http.post('http://localhost:4000/api/bcs-analysis/upload-urls', async ({ request }) => {
        uploadUrlCalls += 1;
        const body = await request.json();
        expect(body.cowsId).toBe('4417');
        expect(body.files).toHaveLength(2);
        return HttpResponse.json({
          cowsId: '4417',
          batchTimestamp: '2026-07-16T00-00-00-000Z',
          uploads: body.files.map((f) => ({
            filename: f.filename,
            gsUri: `gs://test-bucket/4417/2026-07-16T00-00-00-000Z/${f.filename}`,
            uploadUrl: `https://storage.googleapis.com/test-bucket/4417/${f.filename}`,
          })),
        });
      }),
      http.put('https://storage.googleapis.com/test-bucket/4417/:filename', () => {
        putCalls += 1;
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('http://localhost:4000/api/bcs-analysis', async ({ request }) => {
        createCalls += 1;
        const body = await request.json();
        expect(body.cowsId).toBe('4417');
        expect(body.cowsImages).toHaveLength(2);
        return HttpResponse.json(
          { bcsAnalysis: { id: 'a1', cowsId: '4417', cowsImages: body.cowsImages, status: 'not_started', bcsScore: {} } },
          { status: 201 }
        );
      }),
      http.post('http://localhost:8000/api/bcs/analyze/a1', () => {
        analyzeCalls += 1;
        return HttpResponse.json({ id: 'a1', status: 'processing' }, { status: 202 });
      })
    );

    const user = renderUpload();
    await user.type(screen.getByLabelText(/cow id/i), '4417');
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    const fileA = new File(['fake-bytes-a'], 'cow-a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['fake-bytes-b'], 'cow-b.jpg', { type: 'image/jpeg' });
    await user.upload(input, [fileA, fileB]);

    await user.click(screen.getByRole('button', { name: /upload photos/i }));

    await waitFor(() => expect(screen.getByText(/herd page/i)).toBeInTheDocument(), { timeout: 5000 });

    expect(uploadUrlCalls).toBe(1);
    expect(putCalls).toBe(2);
    expect(createCalls).toBe(1);
    expect(analyzeCalls).toBe(1);
  });

  it('sanitizes original filenames instead of discarding them, deduping collisions within a batch', async () => {
    let sentFilenames = [];
    server.use(
      http.post('http://localhost:4000/api/bcs-analysis/upload-urls', async ({ request }) => {
        const body = await request.json();
        sentFilenames = body.files.map((f) => f.filename);
        return HttpResponse.json({
          cowsId: '4417',
          batchTimestamp: '2026-07-16T00-00-00-000Z',
          uploads: body.files.map((f) => ({
            filename: f.filename,
            gsUri: `gs://test-bucket/4417/2026-07-16T00-00-00-000Z/${f.filename}`,
            uploadUrl: `https://storage.googleapis.com/test-bucket/4417/${f.filename}`,
          })),
        });
      }),
      http.put('https://storage.googleapis.com/test-bucket/4417/:filename', () => new HttpResponse(null, { status: 200 })),
      http.post('http://localhost:4000/api/bcs-analysis', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          { bcsAnalysis: { id: 'a1', cowsId: '4417', cowsImages: body.cowsImages, status: 'not_started', bcsScore: {} } },
          { status: 201 }
        );
      }),
      http.post('http://localhost:8000/api/bcs/analyze/a1', () => HttpResponse.json({ id: 'a1', status: 'processing' }, { status: 202 }))
    );

    const user = renderUpload();
    await user.type(screen.getByLabelText(/cow id/i), '4417');
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    // Spaces/parens get sanitized to '-'; the second file sanitizes to the
    // same base as the first ("cow-side-view") and must not overwrite it.
    const fileA = new File(['a'], 'cow side view.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'cow (side) view.jpg', { type: 'image/jpeg' });
    await user.upload(input, [fileA, fileB]);
    await user.click(screen.getByRole('button', { name: /upload photos/i }));

    await waitFor(() => expect(screen.getByText(/herd page/i)).toBeInTheDocument(), { timeout: 5000 });

    expect(sentFilenames).toEqual(['cow-side-view.jpg', 'cow-side-view-2.jpg']);
  });

  it('still navigates to the herd page even if triggering analysis fails, since the record already exists', async () => {
    server.use(
      http.post('http://localhost:4000/api/bcs-analysis/upload-urls', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          cowsId: '4417',
          batchTimestamp: '2026-07-16T00-00-00-000Z',
          uploads: body.files.map((f) => ({
            filename: f.filename,
            gsUri: `gs://test-bucket/4417/2026-07-16T00-00-00-000Z/${f.filename}`,
            uploadUrl: `https://storage.googleapis.com/test-bucket/4417/${f.filename}`,
          })),
        });
      }),
      http.put('https://storage.googleapis.com/test-bucket/4417/:filename', () => new HttpResponse(null, { status: 200 })),
      http.post('http://localhost:4000/api/bcs-analysis', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          { bcsAnalysis: { id: 'a1', cowsId: '4417', cowsImages: body.cowsImages, status: 'not_started', bcsScore: {} } },
          { status: 201 }
        );
      }),
      http.post('http://localhost:8000/api/bcs/analyze/a1', () => HttpResponse.json({ message: 'AI backend unavailable' }, { status: 500 }))
    );

    const user = renderUpload();
    await user.type(screen.getByLabelText(/cow id/i), '4417');
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    const file = new File(['fake-bytes'], 'cow.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload photos/i }));

    await waitFor(() => expect(screen.getByText(/herd page/i)).toBeInTheDocument(), { timeout: 5000 });
  });

  it('rejects a Cow ID with unsafe characters before calling the API', async () => {
    const user = renderUpload();
    await user.type(screen.getByLabelText(/cow id/i), 'cow/../etc');
    const input = screen.getByLabelText(/choose file/i, { selector: 'input' });
    const file = new File(['fake-bytes'], 'cow.jpg', { type: 'image/jpeg' });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload photos/i }));
    expect(await screen.findByText(/may only contain letters, numbers/i)).toBeInTheDocument();
  });
});
