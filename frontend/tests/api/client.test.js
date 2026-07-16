import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { apiClient, setTokens, clearTokens, getAccessToken } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

describe('apiClient', () => {
  it('attaches the stored access token as a Bearer header', async () => {
    setTokens({ accessToken: 'abc123', refreshToken: 'refresh123' });
    let receivedAuth;
    server.use(
      http.get('http://localhost:4000/api/_probe', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      })
    );
    await apiClient.get('/_probe');
    expect(receivedAuth).toBe('Bearer abc123');
  });

  it('refreshes the access token once on a 401 and retries the original request', async () => {
    setTokens({ accessToken: 'expired', refreshToken: 'refresh123' });
    let probeCalls = 0;
    server.use(
      http.get('http://localhost:4000/api/_probe', ({ request }) => {
        probeCalls += 1;
        if (request.headers.get('authorization') === 'Bearer expired') {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      }),
      http.post('http://localhost:4000/api/auth/refresh', () =>
        HttpResponse.json({ accessToken: 'fresh-token' })
      )
    );
    const res = await apiClient.get('/_probe');
    expect(res.data).toEqual({ ok: true });
    expect(probeCalls).toBe(2);
    expect(getAccessToken()).toBe('fresh-token');
  });
});
