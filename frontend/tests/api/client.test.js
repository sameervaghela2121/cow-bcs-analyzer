import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { apiClient, setTokens, clearTokens, getAccessToken } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

describe('apiClient', () => {
  it('attaches the stored access token as a Bearer header', async () => {
    setTokens({ accessToken: 'abc123' });
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

  // Access tokens never expire and there's no refresh flow, so a 401 means
  // the token is genuinely invalid/revoked - clear it instead of retrying.
  it('clears the stored token on a 401 instead of retrying', async () => {
    setTokens({ accessToken: 'revoked' });
    server.use(http.get('http://localhost:4000/api/_probe', () => new HttpResponse(null, { status: 401 })));
    await expect(apiClient.get('/_probe')).rejects.toBeTruthy();
    expect(getAccessToken()).toBeNull();
  });
});
