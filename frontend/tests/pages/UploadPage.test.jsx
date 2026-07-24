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

  it('toggles to the Milking Data section and uploads a .xlsx straight to GCS, then triggers the import', async () => {
    let uploadUrlBody;
    let putCalled = false;
    let importBody;
    server.use(
      http.post('http://localhost:4000/api/milking-data/upload-url', async ({ request }) => {
        uploadUrlBody = await request.json();
        return HttpResponse.json({
          dateFolder: '2026-07-22',
          filename: uploadUrlBody.filename,
          gsUri: `gs://sameerv-cow-milking-data/2026-07-22/${uploadUrlBody.filename}`,
          objectPath: `2026-07-22/${uploadUrlBody.filename}`,
          uploadUrl: `https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/${uploadUrlBody.filename}`,
        });
      }),
      http.put('https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/:filename', () => {
        putCalled = true;
        return new HttpResponse(null, { status: 200 });
      }),
      http.post('http://localhost:4000/api/milking-data/import', async ({ request }) => {
        importBody = await request.json();
        return HttpResponse.json({ source: 'SCR', recordsInserted: 4 });
      })
    );

    const user = renderUpload();
    await user.click(screen.getByRole('button', { name: /milking data/i }));

    const input = screen.getByLabelText(/choose milking data file/i, { selector: 'input' });
    const file = new File(['fake-bytes'], 'scr-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload & import/i }));

    expect(await screen.findByText(/import complete: 4 SCR records added/i)).toBeInTheDocument();
    expect(uploadUrlBody.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(putCalled).toBe(true);
    expect(importBody.objectPath).toBe(`2026-07-22/${uploadUrlBody.filename}`);
    // The picked file is no longer shown once the import succeeds - only the banner remains.
    expect(screen.queryByText('scr-export.xlsx')).not.toBeInTheDocument();
  });

  it('clears the picked milking file once the GCS upload succeeds, even if the import step afterwards fails', async () => {
    server.use(
      http.post('http://localhost:4000/api/milking-data/upload-url', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          dateFolder: '2026-07-22',
          filename: body.filename,
          gsUri: `gs://sameerv-cow-milking-data/2026-07-22/${body.filename}`,
          objectPath: `2026-07-22/${body.filename}`,
          uploadUrl: `https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/${body.filename}`,
        });
      }),
      http.put('https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/:filename', () => new HttpResponse(null, { status: 200 })),
      http.post('http://localhost:4000/api/milking-data/import', () =>
        HttpResponse.json(
          { error: 'This file is missing the Cow Id for row 3. Please fill in the Cow Id for every row and re-upload the file. No records were imported.' },
          { status: 400 }
        )
      )
    );

    const user = renderUpload();
    await user.click(screen.getByRole('button', { name: /milking data/i }));

    const input = screen.getByLabelText(/choose milking data file/i, { selector: 'input' });
    const file = new File(['fake-bytes'], 'delpro-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload & import/i }));

    expect(await screen.findByText(/missing the Cow Id for row 3/i)).toBeInTheDocument();
    // The file was already uploaded to GCS by the time the import failed -
    // it must not still be shown as "picked", and the retry button for it
    // (which would just re-upload the same already-uploaded file) is gone too.
    expect(screen.queryByText('delpro-export.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upload & import/i })).not.toBeInTheDocument();
  });

  it('shows the drop zone again (disabled, not hidden) while the import job is still running after upload, then re-enables it once done', async () => {
    let releaseImport;
    const importStarted = new Promise((resolve) => {
      server.use(
        http.post('http://localhost:4000/api/milking-data/upload-url', async ({ request }) => {
          const body = await request.json();
          return HttpResponse.json({
            dateFolder: '2026-07-22',
            filename: body.filename,
            gsUri: `gs://sameerv-cow-milking-data/2026-07-22/${body.filename}`,
            objectPath: `2026-07-22/${body.filename}`,
            uploadUrl: `https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/${body.filename}`,
          });
        }),
        http.put('https://storage.googleapis.com/sameerv-cow-milking-data/2026-07-22/:filename', () => new HttpResponse(null, { status: 200 })),
        http.post('http://localhost:4000/api/milking-data/import', async () => {
          resolve();
          await new Promise((r) => { releaseImport = r; });
          return HttpResponse.json({ source: 'DelPro', recordsInserted: 9 });
        })
      );
    });

    const user = renderUpload();
    await user.click(screen.getByRole('button', { name: /milking data/i }));

    const input = screen.getByLabelText(/choose milking data file/i, { selector: 'input' });
    const file = new File(['fake-bytes'], 'delpro-export.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /upload & import/i }));

    await importStarted;
    // GCS upload has already succeeded and the import call is in flight: the
    // picked file is gone, but the drop zone itself is back - just disabled,
    // not removed from the page - while the import job runs.
    await screen.findByText(/reading and storing records/i);
    expect(screen.queryByText('delpro-export.xlsx')).not.toBeInTheDocument();
    const dropZoneInput = screen.getByLabelText(/choose milking data file/i, { selector: 'input' });
    expect(dropZoneInput).toBeInTheDocument();
    expect(dropZoneInput).toBeDisabled();

    releaseImport();
    expect(await screen.findByText(/import complete: 9 DelPro records added/i)).toBeInTheDocument();

    // Once the import job finishes, a fresh drop zone is enabled again.
    const reEnabledInput = screen.getByLabelText(/choose milking data file/i, { selector: 'input' });
    expect(reEnabledInput).not.toBeDisabled();
  });

  it('switching back to BCS Photos does not show the milking upload zone', async () => {
    const user = renderUpload();
    await user.click(screen.getByRole('button', { name: /milking data/i }));
    expect(screen.getByLabelText(/choose milking data file/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^bcs photos$/i }));
    expect(screen.queryByLabelText(/choose milking data file/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/choose file/i, { selector: 'input' })).toBeInTheDocument();
  });
});
