import { render, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import Thumbnail from '../../src/components/Thumbnail.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Thumbnail', () => {
  it('fetches the reading media as a blob and renders it as an image', async () => {
    server.use(
      http.get('http://localhost:4000/api/readings/r1/media', () =>
        HttpResponse.arrayBuffer(new TextEncoder().encode('fake-bytes').buffer, {
          headers: { 'Content-Type': 'image/jpeg' },
        })
      )
    );
    const { container } = render(<Thumbnail readingId="r1" size={58} />);
    await waitFor(() => expect(container.querySelector('img')).toBeTruthy());
    expect(container.querySelector('img').src).toMatch(/^blob:/);
  });
});
