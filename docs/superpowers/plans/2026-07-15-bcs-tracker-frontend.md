# BCS Tracker Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React frontend for BCS Tracker, porting the 7 screens and business rules from `html-reference/BCS Tracker.dc.html` onto the real backend defined in `docs/superpowers/plans/2026-07-15-bcs-tracker-backend.md`.

**Architecture:** Vite + React + React Router, one route per screen. TanStack Query owns all server state (list/detail fetches and the upload-processing poll). A single `AuthContext` holds the JWT pair + current user and gates routes by role. Presentational logic (band/confidence colors, thumbnails) is factored into small shared components instead of the prototype's single `renderVals()` mega-selector.

**Tech Stack:** React 18, Vite, React Router 6, @tanstack/react-query, axios, Vitest + React Testing Library + MSW (mock service worker) for tests.

## Global Constraints

- Backend base URL comes from `VITE_API_URL` (default `http://localhost:4000/api`).
- Auth is email + password, invite-only — there is no signup screen. Only `/login` and `/accept-invite` exist as unauthenticated routes.
- Upload accepts images only (`image/jpeg`, `image/png`, `image/webp`) — no video, per the backend plan's v1 scope. The file input's `accept` attribute must reflect this.
- BCS bands: `score < 2.5` → "Too thin" (`#b45309`); `2.5–3.75` → "Ideal" (`#166534`); `> 3.75` → "Too heavy" (`#1d4ed8`). Confidence pill colors: `high` → green `#166534`, `medium` → amber `#a35a05`, `low` → red `#b91c1c`. These exact values are lifted from the prototype and must not drift, since they're the only visual spec that exists.
- Score display always formats as `score.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0')` (e.g. `3.5` not `3.50`, `3.0` not `3`) — a single `formatScore()` helper, not reimplemented per screen.
- Upload flow is async: `POST /readings` returns `202` immediately; the frontend polls `GET /readings/:id` every 2s until `status !== 'processing'`.
- No demo role-switcher. The active user's role comes only from `GET /auth/me` / the JWT.
- Theme (light/dark) is a pure CSS-custom-property toggle, ported verbatim from the prototype's `THEMES` map — no new theming library.

---

## File Structure

```
frontend/
  package.json
  vite.config.js
  .env.example
  index.html
  src/
    main.jsx                        # ReactDOM.createRoot, QueryClientProvider, BrowserRouter
    App.jsx                          # route table
    api/
      client.js                     # axios instance, access-token header, 401 -> refresh -> retry
      auth.js                       # login, acceptInvite, refresh, logout, me
      users.js
      cows.js
      readings.js
      review.js
      audit.js
    auth/
      AuthContext.jsx                # provider + useAuth() hook
      RequireAuth.jsx                # route guard
      RequireRole.jsx                # role-gated route guard
    domain/
      bcs.js                        # bandFor, confidenceStyle, formatScore, THEMES (ported constants)
    hooks/
      usePollReading.js             # polls GET /readings/:id while status==='processing'
    components/
      AppShell.jsx                   # sidebar/bottom-bar nav + theme toggle + outlet
      Badge.jsx                      # score/band pill
      ConfidencePill.jsx
      Thumbnail.jsx                  # real <img> backed by GET /readings/:id/media
      EmptyState.jsx
      InlineError.jsx
    pages/
      LoginPage.jsx
      AcceptInvitePage.jsx
      UploadPage.jsx
      HerdPage.jsx
      CowDetailPage.jsx
      ReviewPage.jsx
      AuditPage.jsx
      UsersPage.jsx
  tests/
    setup.js                         # jsdom + MSW server bootstrap
    domain/bcs.test.js
    auth/AuthContext.test.jsx
    hooks/usePollReading.test.jsx
    pages/LoginPage.test.jsx
    pages/UploadPage.test.jsx
    pages/HerdPage.test.jsx
    pages/ReviewPage.test.jsx
```

**Note on test depth:** Herd/Review get full behavioral tests since they carry the prototype's most complex client logic (filter/sort/search, stepper). Audit and Users follow the same "fetch a list, render rows" shape already proven by Herd/Review's tests — they get one smoke test each rather than duplicate coverage, and should be checked visually in the browser (Task 18) rather than over-tested.

---

### Task 1: Vite scaffold + routing skeleton

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/.env.example`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/tests/setup.js`
- Test: `frontend/tests/App.test.jsx`

**Interfaces:**
- Produces: a Vite dev server rendering an `<App />` with a placeholder route, and a working Vitest + RTL harness every later task's tests build on.

- [ ] **Step 1: Scaffold and install**

```bash
cd frontend
mkdir -p src/api src/auth src/domain src/hooks src/components src/pages \
         tests/domain tests/auth tests/hooks tests/pages
```

`frontend/package.json`:

```json
{
  "name": "bcs-tracker-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.0",
    "axios": "^1.7.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "msw": "^2.4.9",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

```bash
npm install
```

- [ ] **Step 2: Write `.env.example`**

```
VITE_API_URL=http://localhost:4000/api
```

- [ ] **Step 3: Write `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BCS Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/App.jsx` (placeholder route table, extended in later tasks)**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/herd" replace />} />
      <Route path="/herd" element={<div>Herd placeholder</div>} />
    </Routes>
  );
}
```

- [ ] **Step 6: Write `src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 7: Write `tests/setup.js`**

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Write the failing test `tests/App.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';

describe('App', () => {
  it('redirects / to /herd', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('Herd placeholder')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 1 test

- [ ] **Step 10: Commit**

```bash
git add frontend/package.json frontend/vite.config.js frontend/.env.example frontend/index.html \
        frontend/src/main.jsx frontend/src/App.jsx frontend/tests/setup.js frontend/tests/App.test.jsx
git commit -m "feat(frontend): scaffold vite + react-router + vitest"
```

---

### Task 2: Domain constants (bands, confidence, formatScore, themes)

**Files:**
- Create: `frontend/src/domain/bcs.js`
- Test: `frontend/tests/domain/bcs.test.js`

**Interfaces:**
- Produces: `bandFor(score)` → `{key, label, color, bg}`, `confidenceStyleFor(conf)` → `{color, background}`, `formatScore(score)` → string, `THEMES` → `{light: {...cssVars}, dark: {...cssVars}}`. Used by every page component from Task 8 onward.

- [ ] **Step 1: Write the failing test `tests/domain/bcs.test.js`**

```js
import { bandFor, confidenceStyleFor, formatScore, THEMES } from '../../src/domain/bcs.js';

describe('bandFor', () => {
  it('classifies thin/ideal/heavy at the exact boundaries', () => {
    expect(bandFor(2.25).key).toBe('thin');
    expect(bandFor(2.5).key).toBe('ideal');
    expect(bandFor(3.75).key).toBe('ideal');
    expect(bandFor(4.0).key).toBe('heavy');
  });
});

describe('confidenceStyleFor', () => {
  it('maps high/medium/low to the prototype colors', () => {
    expect(confidenceStyleFor('high').background).toBe('#166534');
    expect(confidenceStyleFor('medium').background).toBe('#a35a05');
    expect(confidenceStyleFor('low').background).toBe('#b91c1c');
  });
});

describe('formatScore', () => {
  it('trims trailing zero but keeps one decimal for whole numbers', () => {
    expect(formatScore(3.5)).toBe('3.5');
    expect(formatScore(3.0)).toBe('3.0');
    expect(formatScore(3.25)).toBe('3.25');
  });
});

describe('THEMES', () => {
  it('has light and dark palettes with the core css vars', () => {
    expect(THEMES.light['--bg-page']).toBe('#f6f5f0');
    expect(THEMES.dark['--bg-page']).toBe('#14170f');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- bcs.test.js`
Expected: FAIL — `Cannot find module '../../src/domain/bcs.js'`

- [ ] **Step 3: Write `src/domain/bcs.js`**

```js
export function bandFor(score) {
  if (score < 2.5) return { key: 'thin', label: 'Too thin', color: '#b45309', bg: '#fbeedd' };
  if (score <= 3.75) return { key: 'ideal', label: 'Ideal', color: '#166534', bg: '#e6f2e8' };
  return { key: 'heavy', label: 'Too heavy', color: '#1d4ed8', bg: '#e8edfc' };
}

export function confidenceStyleFor(confidence) {
  const map = {
    high: { color: '#ffffff', background: '#166534' },
    medium: { color: '#ffffff', background: '#a35a05' },
    low: { color: '#ffffff', background: '#b91c1c' },
  };
  return map[confidence] || map.high;
}

export function formatScore(score) {
  return score.toFixed(2).replace(/0$/, '').replace(/\.$/, '.0');
}

export const THEMES = {
  light: {
    '--bg-page': '#f6f5f0', '--bg-card': '#ffffff', '--border': '#e5e0d3', '--border-soft': '#d8d2c2',
    '--border-soft2': '#e2ddd0', '--text-primary': '#20241f', '--text-secondary': '#82796a',
    '--text-tertiary': '#9a9280', '--chip-bg': '#efece1', '--scrollbar': '#cfc9ba', '--stepper-bg': '#f6f5f0',
  },
  dark: {
    '--bg-page': '#14170f', '--bg-card': '#1e231b', '--border': '#333a2c', '--border-soft': '#3a4432',
    '--border-soft2': '#333a2c', '--text-primary': '#eee8d8', '--text-secondary': '#a39c86',
    '--text-tertiary': '#8a8370', '--chip-bg': '#262b21', '--scrollbar': '#3a4432', '--stepper-bg': '#20241f',
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- bcs.test.js`
Expected: PASS, 4 describe blocks

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domain/bcs.js frontend/tests/domain/bcs.test.js
git commit -m "feat(frontend): port BCS band/confidence/theme constants from prototype"
```

---

### Task 3: API client with token refresh

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/auth.js`
- Test: `frontend/tests/api/client.test.js`

**Interfaces:**
- Consumes: nothing (reads/writes `localStorage` directly for the token pair — simplest persistence for v1).
- Produces: `apiClient` (configured axios instance — every other `api/*.js` module in later tasks imports this instead of calling axios directly). `setTokens({accessToken, refreshToken})`, `clearTokens()`, `getAccessToken()`. `authApi.login`, `authApi.acceptInvite`, `authApi.me`, `authApi.logout`.

- [ ] **Step 1: Write the failing test `tests/api/client.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- client.test.js`
Expected: FAIL — `Cannot find module '../../src/api/client.js'`

- [ ] **Step 3: Write `src/api/client.js`**

```js
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function getAccessToken() {
  return localStorage.getItem('bcs_access_token');
}
function getRefreshToken() {
  return localStorage.getItem('bcs_refresh_token');
}
export function setTokens({ accessToken, refreshToken }) {
  localStorage.setItem('bcs_access_token', accessToken);
  if (refreshToken) localStorage.setItem('bcs_refresh_token', refreshToken);
}
export function clearTokens() {
  localStorage.removeItem('bcs_access_token');
  localStorage.removeItem('bcs_refresh_token');
}

export const apiClient = axios.create({ baseURL: BASE_URL });

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retried && getRefreshToken()) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise || axios
          .post(`${BASE_URL}/auth/refresh`, { refreshToken: getRefreshToken() })
          .finally(() => { refreshPromise = null; });
        const { data } = await refreshPromise;
        setTokens({ accessToken: data.accessToken });
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(original);
      } catch (refreshErr) {
        clearTokens();
        throw refreshErr;
      }
    }
    throw error;
  }
);
```

- [ ] **Step 4: Write `src/api/auth.js`**

```js
import { apiClient } from './client.js';

export const authApi = {
  login: (email, password) => apiClient.post('/auth/login', { email, password }).then((r) => r.data),
  acceptInvite: (email, token, password) =>
    apiClient.post('/auth/accept-invite', { email, token, password }).then((r) => r.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data),
  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- client.test.js`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/auth.js frontend/tests/api/client.test.js
git commit -m "feat(frontend): add API client with automatic access-token refresh"
```

---

### Task 4: AuthContext + route guards

**Files:**
- Create: `frontend/src/auth/AuthContext.jsx`
- Create: `frontend/src/auth/RequireAuth.jsx`
- Create: `frontend/src/auth/RequireRole.jsx`
- Test: `frontend/tests/auth/AuthContext.test.jsx`

**Interfaces:**
- Consumes: `authApi`, `setTokens`/`clearTokens`/`getAccessToken` from `api/client.js`.
- Produces: `AuthProvider`, `useAuth()` → `{user, status ('loading'|'authenticated'|'unauthenticated'), login(email,password), acceptInvite(email,token,password), logout()}`. `<RequireAuth>` and `<RequireRole role="admin">` wrapper components — used by `App.jsx` from Task 5 onward.

- [ ] **Step 1: Write the failing test `tests/auth/AuthContext.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function Probe() {
  const { user, status, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email || 'none'}</div>
      <button onClick={() => login('a@example.com', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('starts unauthenticated with no stored token, then logs in successfully', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'a@example.com', name: 'A', role: 'staff' },
        })
      )
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));

    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('a@example.com');
  });

  it('bootstraps as authenticated when a valid access token is already stored', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ id: '1', email: 'existing@example.com', name: 'E', role: 'admin' })
      )
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe('existing@example.com');
  });

  it('clears user state on logout', async () => {
    localStorage.setItem('bcs_access_token', 'existing-token');
    server.use(
      http.get('http://localhost:4000/api/auth/me', () =>
        HttpResponse.json({ id: '1', email: 'existing@example.com', name: 'E', role: 'admin' })
      ),
      http.post('http://localhost:4000/api/auth/logout', () => HttpResponse.json({ ok: true }))
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AuthContext.test.jsx`
Expected: FAIL — `Cannot find module '../../src/auth/AuthContext.jsx'`

- [ ] **Step 3: Write `src/auth/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/auth.js';
import { setTokens, clearTokens, getAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!getAccessToken()) {
      setStatus('unauthenticated');
      return;
    }
    authApi.me()
      .then((u) => { setUser(u); setStatus('authenticated'); })
      .catch(() => { clearTokens(); setStatus('unauthenticated'); });
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const acceptInvite = useCallback(async (email, token, password) => {
    const data = await authApi.acceptInvite(email, token, password);
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* token may already be invalid; clear anyway */ }
    clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, acceptInvite, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Write `src/auth/RequireAuth.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <div>Loading&hellip;</div>;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 5: Write `src/auth/RequireRole.jsx`**

```jsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireRole({ role }) {
  const { user } = useAuth();
  if (user?.role !== role) return <Navigate to="/herd" replace />;
  return <Outlet />;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- AuthContext.test.jsx`
Expected: PASS, 3 tests

- [ ] **Step 7: Commit**

```bash
git add frontend/src/auth frontend/tests/auth/AuthContext.test.jsx
git commit -m "feat(frontend): add AuthContext and route guards"
```

---

### Task 5: Login page

**Files:**
- Create: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/LoginPage.test.jsx`

**Interfaces:**
- Consumes: `useAuth()`.
- Produces: `/login` route. Ported from the prototype's login card (lines 40–63 of the reference), but email+password instead of mobile+OTP.

- [ ] **Step 1: Write the failing test `tests/pages/LoginPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import LoginPage from '../../src/pages/LoginPage.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider><LoginPage /></AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('shows an error when the API rejects the credentials', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
      )
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrongpw');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
  });

  it('logs in successfully with valid credentials', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'ok@example.com', name: 'OK', role: 'staff' },
        })
      )
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText(/email/i), 'ok@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-password');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    await waitFor(() => expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- LoginPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/LoginPage.jsx'`

- [ ] **Step 3: Write `src/pages/LoginPage.jsx`**

```jsx
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f5f0' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, maxWidth: '90vw', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, padding: '32px 28px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>BCS Tracker</div>
        <div style={{ fontSize: 13, color: '#82796a', marginBottom: 24 }}>Staff login</div>

        <label htmlFor="login-email" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</label>
        <input
          id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 16 }}
        />

        <label htmlFor="login-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
        <input
          id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the route in `src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/herd" replace />} />
      <Route path="/herd" element={<div>Herd placeholder</div>} />
    </Routes>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- LoginPage.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/src/App.jsx frontend/tests/pages/LoginPage.test.jsx
git commit -m "feat(frontend): add email/password login page"
```

---

### Task 6: Accept-invite page

**Files:**
- Create: `frontend/src/pages/AcceptInvitePage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/AcceptInvitePage.test.jsx`

**Interfaces:**
- Consumes: `useAuth().acceptInvite`, `useSearchParams` (reads `?token=&email=` from the invite email link built by the backend's `userService.inviteUser`).
- Produces: `/accept-invite` route.

- [ ] **Step 1: Write the failing test `tests/pages/AcceptInvitePage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import AcceptInvitePage from '../../src/pages/AcceptInvitePage.jsx';
import { clearTokens } from '../../src/api/client.js';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => { server.resetHandlers(); clearTokens(); });
afterAll(() => server.close());

function renderPage(search) {
  return render(
    <MemoryRouter initialEntries={[`/accept-invite${search}`]}>
      <AuthProvider><AcceptInvitePage /></AuthProvider>
    </MemoryRouter>
  );
}

describe('AcceptInvitePage', () => {
  it('submits the token from the URL plus a chosen password', async () => {
    let sentBody;
    server.use(
      http.post('http://localhost:4000/api/auth/accept-invite', async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({
          accessToken: 'acc', refreshToken: 'ref',
          user: { id: '1', email: 'invitee@example.com', name: 'Invitee', role: 'staff' },
        });
      })
    );
    renderPage('?token=rawtoken123&email=invitee%40example.com');
    await userEvent.type(screen.getByLabelText(/new password/i), 'my-new-password');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(sentBody).toEqual({
      email: 'invitee@example.com', token: 'rawtoken123', password: 'my-new-password',
    }));
  });

  it('shows an error for an expired or invalid invite', async () => {
    server.use(
      http.post('http://localhost:4000/api/auth/accept-invite', () =>
        HttpResponse.json({ error: 'This invite link has expired.' }, { status: 400 })
      )
    );
    renderPage('?token=stale&email=invitee%40example.com');
    await userEvent.type(screen.getByLabelText(/new password/i), 'my-new-password');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AcceptInvitePage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/AcceptInvitePage.jsx'`

- [ ] **Step 3: Write `src/pages/AcceptInvitePage.jsx`**

```jsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite(email, token, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not activate your account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f5f0' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, maxWidth: '90vw', background: '#fff', border: '1px solid #e5e0d3', borderRadius: 14, padding: '32px 28px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Activate your account</div>
        <div style={{ fontSize: 13, color: '#82796a', marginBottom: 24 }}>{email}</div>

        <label htmlFor="invite-password" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>New password</label>
        <input
          id="invite-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {submitting ? 'Setting password…' : 'Set password & log in'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add the route in `src/App.jsx`**

```jsx
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
// ...
<Route path="/accept-invite" element={<AcceptInvitePage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- AcceptInvitePage.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AcceptInvitePage.jsx frontend/src/App.jsx frontend/tests/pages/AcceptInvitePage.test.jsx
git commit -m "feat(frontend): add accept-invite page"
```

---

### Task 7: App shell (sidebar nav, theme toggle, responsive bottom bar)

**Files:**
- Create: `frontend/src/components/AppShell.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/components/AppShell.test.jsx`

**Interfaces:**
- Consumes: `useAuth()`, `THEMES` from `domain/bcs.js`.
- Produces: `<AppShell>` — wraps every authenticated route via `<Outlet>`, renders the sidebar nav (Upload/Herd/Review/Audit/+Users if admin), applies the theme's CSS vars to the root, and exposes a "flagged count" badge fed by `review/queue` (wired in Task 12 once that endpoint exists — for now the badge count prop defaults to 0 and is documented as a TODO wired later, since AppShell must exist before ReviewPage does).

- [ ] **Step 1: Write the failing test `tests/components/AppShell.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import AppShell from '../../src/components/AppShell.jsx';

vi.mock('../../src/auth/AuthContext.jsx', async () => {
  const actual = await vi.importActual('../../src/auth/AuthContext.jsx');
  return {
    ...actual,
    useAuth: () => ({ user: { role: 'admin', name: 'Admin' }, logout: vi.fn() }),
  };
});

describe('AppShell', () => {
  it('shows the User Management nav item for admins', () => {
    render(
      <MemoryRouter initialEntries={['/herd']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herd" element={<div>Herd content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Herd content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AppShell.test.jsx`
Expected: FAIL — `Cannot find module '../../src/components/AppShell.jsx'`

- [ ] **Step 3: Write `src/components/AppShell.jsx`**

```jsx
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { THEMES } from '../domain/bcs.js';

const navBase = { padding: '10px 12px', borderRadius: 8, fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, color: '#eee8d8', textDecoration: 'none' };
const navActive = { ...navBase, background: '#33443a' };

export default function AppShell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState('light');
  const isAdmin = user?.role === 'admin';
  const rootStyle = { ...THEMES[theme], display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-page)', color: 'var(--text-primary)' };

  return (
    <div style={rootStyle}>
      <div style={{ width: 216, flexShrink: 0, background: '#1c2a20', color: '#eee8d8', display: 'flex', flexDirection: 'column', padding: '22px 14px', gap: 2 }}>
        <div style={{ fontSize: 17, fontWeight: 700, padding: '2px 10px 22px' }}>BCS Tracker</div>
        <NavLink to="/upload" style={({ isActive }) => (isActive ? navActive : navBase)}>Upload</NavLink>
        <NavLink to="/herd" style={({ isActive }) => (isActive ? navActive : navBase)}>Herd</NavLink>
        <NavLink to="/review" style={({ isActive }) => (isActive ? navActive : navBase)}>Review</NavLink>
        <NavLink to="/audit" style={({ isActive }) => (isActive ? navActive : navBase)}>Audit Log</NavLink>
        {isAdmin && (
          <NavLink to="/users" style={({ isActive }) => (isActive ? navActive : navBase)}>User Management</NavLink>
        )}
        <div style={{ marginTop: 'auto', padding: '10px 10px 4px', fontSize: 11, color: '#9a9280' }}>{user?.name}</div>
        <div onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#c9c2ae', padding: '7px 8px', borderRadius: 6, background: '#26362b' }}>
          <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          <span>{theme === 'dark' ? '☾' : '☀'}</span>
        </div>
        <div onClick={logout} style={{ cursor: 'pointer', fontSize: '11.5px', color: '#c9c2ae', marginTop: 10 }}>Log out</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- AppShell.test.jsx`
Expected: PASS, 1 test

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AppShell.jsx frontend/tests/components/AppShell.test.jsx
git commit -m "feat(frontend): add app shell with sidebar nav and theme toggle"
```

---

### Task 8: Cows API module + Herd page

**Files:**
- Create: `frontend/src/api/cows.js`
- Create: `frontend/src/components/Badge.jsx`
- Create: `frontend/src/pages/HerdPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/HerdPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `bandFor`/`formatScore` from `domain/bcs.js`.
- Produces: `cowsApi.list({search, filter, sort})`, `cowsApi.get(cowId)`, `cowsApi.readings(cowId)`. `<Badge>` — reusable score/band pill, used by Herd, Detail, Review, Audit. `/herd` route wired into `AppShell`.

- [ ] **Step 1: Write `src/api/cows.js`**

```js
import { apiClient } from './client.js';

export const cowsApi = {
  list: (params = {}) => apiClient.get('/cows', { params }).then((r) => r.data),
  get: (cowId) => apiClient.get(`/cows/${cowId}`).then((r) => r.data),
  readings: (cowId, params = {}) => apiClient.get(`/cows/${cowId}/readings`, { params }).then((r) => r.data),
  create: (payload) => apiClient.post('/cows', payload).then((r) => r.data),
  update: (cowId, payload) => apiClient.patch(`/cows/${cowId}`, payload).then((r) => r.data),
};
```

- [ ] **Step 2: Write `src/components/Badge.jsx`**

```jsx
import { bandFor, formatScore } from '../domain/bcs.js';

export default function Badge({ score }) {
  const band = bandFor(score);
  return (
    <span style={{ color: '#fff', background: band.color, fontSize: '13.5px', fontWeight: 800, padding: '4px 11px', borderRadius: 999 }}>
      {formatScore(score)}
    </span>
  );
}
```

- [ ] **Step 3: Write the failing test `tests/pages/HerdPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import HerdPage from '../../src/pages/HerdPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHerd() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HerdPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('HerdPage', () => {
  it('renders cows returned by the API', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows', () =>
        HttpResponse.json({
          cows: [
            { cowId: '4417', latestScore: 3.25, latestBand: 'ideal', pen: 'Pen 1', flagged: false, lastScoredAt: '2026-07-10T00:00:00Z' },
            { cowId: '5001', latestScore: 4.5, latestBand: 'heavy', pen: 'Pen 2', flagged: true, lastScoredAt: '2026-07-09T00:00:00Z' },
          ],
          total: 2,
        })
      )
    );
    renderHerd();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Cow 5001')).toBeInTheDocument();
  });

  it('re-fetches with the flagged filter when the Flagged chip is clicked', async () => {
    let lastParams;
    server.use(
      http.get('http://localhost:4000/api/cows', ({ request }) => {
        lastParams = new URL(request.url).searchParams.get('filter');
        return HttpResponse.json({ cows: [], total: 0 });
      })
    );
    renderHerd();
    await waitFor(() => expect(lastParams).toBe(null));
    await userEvent.click(screen.getByText('Flagged'));
    await waitFor(() => expect(lastParams).toBe('flagged'));
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npm test -- HerdPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/HerdPage.jsx'`

- [ ] **Step 5: Write `src/pages/HerdPage.jsx`**

```jsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cowsApi } from '../api/cows.js';
import Badge from '../components/Badge.jsx';
import { bandFor } from '../domain/bcs.js';

const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'flagged', label: 'Flagged' },
  { key: 'thin', label: 'Too thin' }, { key: 'ideal', label: 'Ideal' }, { key: 'heavy', label: 'Too heavy' },
];

export default function HerdPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');

  const { data } = useQuery({
    queryKey: ['cows', { search, filter, sort }],
    queryFn: () => cowsApi.list({ search: search || undefined, filter: filter === 'all' ? undefined : filter, sort }),
  });

  const cows = data?.cows || [];

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Herd Overview</h1>
        <div style={{ fontSize: 13, color: '#82796a' }}>{cows.length} of {data?.total ?? 0} cows shown</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 22 }}>
        <input
          placeholder="Search cow ID…" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #d8d2c2', width: 160 }}
        />
        {FILTERS.map((f) => (
          <div
            key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1px solid #d8d2c2', background: filter === f.key ? '#1c2a20' : '#fff',
              color: filter === f.key ? '#fff' : '#20241f',
            }}
          >
            {f.label}
          </div>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ marginLeft: 'auto', padding: '9px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }}>
          <option value="recent">Sort: Most recently scored</option>
          <option value="bcs-asc">Sort: BCS low to high</option>
          <option value="bcs-desc">Sort: BCS high to low</option>
          <option value="flagged">Sort: Flagged first</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
        {cows.map((cow) => (
          <div
            key={cow.cowId} onClick={() => navigate(`/herd/${cow.cowId}`)}
            style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
          >
            <div style={{ height: 92, background: 'linear-gradient(135deg,#7c9b85,#4f6b57)' }} />
            <div style={{ padding: '12px 14px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Cow {cow.cowId}</div>
                <Badge score={cow.latestScore} />
              </div>
              <div style={{ fontSize: 12, color: '#82796a', marginTop: 4 }}>{bandFor(cow.latestScore).label} &middot; {cow.pen}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire `/herd` into `AppShell` in `src/App.jsx`**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import AcceptInvitePage from './pages/AcceptInvitePage.jsx';
import HerdPage from './pages/HerdPage.jsx';
import AppShell from './components/AppShell.jsx';
import RequireAuth from './auth/RequireAuth.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/herd" replace />} />
          <Route path="/herd" element={<HerdPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npm test -- HerdPage.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/cows.js frontend/src/components/Badge.jsx frontend/src/pages/HerdPage.jsx \
        frontend/src/App.jsx frontend/tests/pages/HerdPage.test.jsx
git commit -m "feat(frontend): add herd overview page with search/filter/sort"
```

---

### Task 9: ConfidencePill + Thumbnail components

**Files:**
- Create: `frontend/src/components/ConfidencePill.jsx`
- Create: `frontend/src/components/Thumbnail.jsx`
- Test: `frontend/tests/components/Thumbnail.test.jsx`

**Interfaces:**
- Consumes: `confidenceStyleFor` from `domain/bcs.js`, `getAccessToken` from `api/client.js`.
- Produces: `<ConfidencePill confidence="high|medium|low" />`. `<Thumbnail readingId size={58} />` — renders `<img src="{API_URL}/readings/{id}/media">`; since `GET /readings/:id/media` requires auth and `<img src>` can't send an Authorization header, this fetches the image as a blob via `apiClient` and renders it as an object URL. Used by CowDetailPage (Task 10) and ReviewPage (Task 12).

- [ ] **Step 1: Write `src/components/ConfidencePill.jsx`**

```jsx
import { confidenceStyleFor } from '../domain/bcs.js';

export default function ConfidencePill({ confidence }) {
  const style = confidenceStyleFor(confidence);
  return (
    <span style={{ ...style, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, textTransform: 'capitalize' }}>
      {confidence}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing test `tests/components/Thumbnail.test.jsx`**

```jsx
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Thumbnail.test.jsx`
Expected: FAIL — `Cannot find module '../../src/components/Thumbnail.jsx'`

- [ ] **Step 4: Write `src/components/Thumbnail.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client.js';

export default function Thumbnail({ readingId, size = 58 }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    apiClient.get(`/readings/${readingId}/media`, { responseType: 'blob' }).then((res) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(res.data);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [readingId]);

  if (!url) {
    return <div style={{ width: size, height: size, borderRadius: 8, background: '#e5e0d3', flexShrink: 0 }} />;
  }
  return <img src={url} alt="" style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Thumbnail.test.jsx`
Expected: PASS, 1 test

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ConfidencePill.jsx frontend/src/components/Thumbnail.jsx frontend/tests/components/Thumbnail.test.jsx
git commit -m "feat(frontend): add confidence pill and auth-aware thumbnail component"
```

---

### Task 10: Cow detail page (trend chart + history)

**Files:**
- Create: `frontend/src/pages/CowDetailPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/CowDetailPage.test.jsx`

**Interfaces:**
- Consumes: `cowsApi.get`, `cowsApi.readings`, `Badge`, `ConfidencePill`, `Thumbnail`, `bandFor`/`formatScore`.
- Produces: `/herd/:cowId` route — metadata header, SVG trend chart (ported from the prototype's banded-background chart), reading history list.

- [ ] **Step 1: Write the failing test `tests/pages/CowDetailPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import CowDetailPage from '../../src/pages/CowDetailPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/herd/4417']}>
        <Routes>
          <Route path="/herd/:cowId" element={<CowDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CowDetailPage', () => {
  it('renders cow metadata and reading history', async () => {
    server.use(
      http.get('http://localhost:4000/api/cows/4417', () =>
        HttpResponse.json({ cow: { cowId: '4417', breed: 'Holstein', lactation: 'Mid', pen: 'Pen 1', latestScore: 3.25, latestBand: 'ideal' } })
      ),
      http.get('http://localhost:4000/api/cows/4417/readings', () =>
        HttpResponse.json({
          readings: [
            { id: 'r1', score: 3.25, confidence: 'high', band: 'ideal', capturedAt: '2026-07-10T00:00:00Z', flagged: false },
            { id: 'r2', score: 3.5, confidence: 'medium', band: 'ideal', capturedAt: '2026-07-01T00:00:00Z', flagged: false },
          ],
          total: 2,
        })
      ),
      http.get('http://localhost:4000/api/readings/r1/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0))),
      http.get('http://localhost:4000/api/readings/r2/media', () => HttpResponse.arrayBuffer(new ArrayBuffer(0)))
    );
    renderDetail();
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Holstein')).toBeInTheDocument();
    expect(screen.getAllByText(/confirmed/i).length + screen.getAllByText(/high|medium/i).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- CowDetailPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/CowDetailPage.jsx'`

- [ ] **Step 3: Write `src/pages/CowDetailPage.jsx`**

```jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cowsApi } from '../api/cows.js';
import Badge from '../components/Badge.jsx';
import ConfidencePill from '../components/ConfidencePill.jsx';
import Thumbnail from '../components/Thumbnail.jsx';
import { bandFor, formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CowDetailPage() {
  const { cowId } = useParams();
  const navigate = useNavigate();

  const { data: cowData } = useQuery({ queryKey: ['cow', cowId], queryFn: () => cowsApi.get(cowId) });
  const { data: readingsData } = useQuery({ queryKey: ['cow-readings', cowId], queryFn: () => cowsApi.readings(cowId) });

  const cow = cowData?.cow;
  const readings = readingsData?.readings || [];
  const readingsAsc = [...readings].reverse();
  const n = readingsAsc.length;
  const chartPoints = readingsAsc.map((r, i) => ({
    x: n === 1 ? 335 : 60 + (i / (n - 1)) * 550,
    y: 230 - (r.score - 1) * 52.5,
    color: bandFor(r.score).color,
  }));
  const trendPoints = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');

  if (!cow) return <div style={{ padding: 28 }}>Loading&hellip;</div>;

  return (
    <div style={{ padding: '28px 28px 60px' }}>
      <div onClick={() => navigate('/herd')} style={{ cursor: 'pointer', color: '#166534', fontWeight: 600, marginBottom: 18 }}>&#8592; Back to herd</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 6px' }}>Cow {cow.cowId}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.breed}</span>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.lactation} lactation</span>
            <span style={{ fontSize: '12.5px', background: '#efece1', padding: '5px 11px', borderRadius: 999 }}>{cow.pen}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#82796a' }}>Current BCS</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: bandFor(cow.latestScore).color }}>{formatScore(cow.latestScore)}</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 20, marginBottom: 26 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>BCS Trend</div>
        <svg viewBox="0 0 640 270" style={{ width: '100%', height: 'auto' }}>
          <rect x="50" y="151.25" width="570" height="78.75" fill="#fbeedd" />
          <rect x="50" y="85.625" width="570" height="65.625" fill="#e6f2e8" />
          <rect x="50" y="20" width="570" height="65.625" fill="#e8edfc" />
          <polyline points={trendPoints} fill="none" stroke="#1c2a20" strokeWidth="2.5" />
          {chartPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5.5} fill={p.color} stroke="#fff" strokeWidth={1.5} />)}
        </svg>
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Reading History</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {readings.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
            <Thumbnail readingId={r.id} size={52} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{fmtDate(r.capturedAt)}</div>
              <div style={{ fontSize: 12, color: '#82796a' }}>{r.flagged ? `Flagged — ${r.confidence} confidence` : 'Confirmed'}</div>
            </div>
            <ConfidencePill confidence={r.confidence} />
            <Badge score={r.score} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `/herd/:cowId` into `App.jsx`**

```jsx
import CowDetailPage from './pages/CowDetailPage.jsx';
// inside the AppShell route group:
<Route path="/herd/:cowId" element={<CowDetailPage />} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- CowDetailPage.test.jsx`
Expected: PASS, 1 test

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CowDetailPage.jsx frontend/src/App.jsx frontend/tests/pages/CowDetailPage.test.jsx
git commit -m "feat(frontend): add cow detail page with trend chart and history"
```

---

### Task 11: usePollReading hook + Upload page

**Files:**
- Create: `frontend/src/api/readings.js`
- Create: `frontend/src/hooks/usePollReading.js`
- Create: `frontend/src/pages/UploadPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/hooks/usePollReading.test.jsx`
- Test: `frontend/tests/pages/UploadPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`.
- Produces: `readingsApi.upload({cowId, file})` → `{readingId, status}`. `readingsApi.get(id)` → full reading. `usePollReading(readingId)` → `{reading, isDone}` (polls every 2s while `status === 'processing'`, wraps `useQuery`'s `refetchInterval`). `/upload` route.

- [ ] **Step 1: Write `src/api/readings.js`**

```js
import { apiClient } from './client.js';

export const readingsApi = {
  upload: ({ cowId, file }) => {
    const form = new FormData();
    form.append('cowId', cowId);
    form.append('file', file);
    return apiClient.post('/readings', form).then((r) => r.data);
  },
  get: (id) => apiClient.get(`/readings/${id}`).then((r) => r.data.reading),
};
```

- [ ] **Step 2: Write the failing test `tests/hooks/usePollReading.test.jsx`**

```jsx
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- usePollReading.test.jsx`
Expected: FAIL — `Cannot find module '../../src/hooks/usePollReading.js'`

- [ ] **Step 4: Write `src/hooks/usePollReading.js`**

```js
import { useQuery } from '@tanstack/react-query';
import { readingsApi } from '../api/readings.js';

export function usePollReading(readingId) {
  const { data: reading } = useQuery({
    queryKey: ['reading', readingId],
    queryFn: () => readingsApi.get(readingId),
    enabled: !!readingId,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2000 : false),
  });

  return { reading, isDone: !!reading && reading.status !== 'processing' };
}
```

- [ ] **Step 5: Run the hook test to verify it passes**

Run: `cd frontend && npm test -- usePollReading.test.jsx`
Expected: PASS, 1 test

- [ ] **Step 6: Write the failing test `tests/pages/UploadPage.test.jsx`**

```jsx
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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npm test -- UploadPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/UploadPage.jsx'`

- [ ] **Step 8: Write `src/pages/UploadPage.jsx`**

```jsx
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readingsApi } from '../api/readings.js';
import { usePollReading } from '../hooks/usePollReading.js';
import { bandFor, formatScore } from '../domain/bcs.js';

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [cowId, setCowId] = useState('');
  const [error, setError] = useState(null);
  const [readingId, setReadingId] = useState(null);

  const { reading, isDone } = usePollReading(readingId);

  async function handleFile(file) {
    if (!cowId.trim()) {
      setError('Enter a Cow ID before uploading.');
      return;
    }
    setError(null);
    try {
      const { readingId: id } = await readingsApi.upload({ cowId: cowId.trim(), file });
      setReadingId(id);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.');
    }
  }

  function uploadAnother() {
    setReadingId(null);
    setCowId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Upload BCS Reading</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 28px' }}>Upload a photo from the parlor exit or feeding lane.</p>

      <label htmlFor="upload-cow-id" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Cow ID</label>
      <input
        id="upload-cow-id" value={cowId} onChange={(e) => setCowId(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #d8d2c2', borderRadius: 8, marginBottom: 20 }}
      />

      {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {!readingId && (
        <div style={{ border: '2px dashed #c7c0ac', borderRadius: 12, padding: '44px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>&#128247;</div>
          <label htmlFor="upload-file-input" style={{ fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Choose file</label>
          <input
            id="upload-file-input" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            style={{ display: 'block', margin: '10px auto 0' }}
          />
        </div>
      )}

      {readingId && !isDone && (
        <div style={{ border: '1px solid #e2ddd0', borderRadius: 12, padding: '36px 28px', background: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Extracting frame &amp; scoring&hellip;</div>
        </div>
      )}

      {isDone && reading?.status === 'scored' && (
        <div style={{ border: '1px solid #e2ddd0', borderRadius: 12, padding: 24, background: '#fff' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 16 }}>&#10003; Reading saved</div>
          <div style={{ fontSize: 12, color: '#82796a' }}>BCS Score</div>
          <div style={{ fontSize: 34, fontWeight: 800, color: bandFor(reading.score).color }}>{formatScore(reading.score)}</div>
          {reading.flagged && <div style={{ marginTop: 10, fontSize: '12.5px', color: '#b91c1c', fontWeight: 600 }}>&#9873; Flagged for review</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
            <button onClick={uploadAnother} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Upload another</button>
            <button onClick={() => navigate(`/herd/${cowId}`)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>View cow history</button>
          </div>
        </div>
      )}

      {isDone && reading?.status === 'failed' && (
        <div style={{ background: '#fbe4e4', color: '#b91c1c', padding: '16px 18px', borderRadius: 12 }}>
          Scoring failed: {reading.errorMessage}
          <div style={{ marginTop: 12 }}>
            <button onClick={uploadAnother} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Wire `/upload` into `App.jsx`**

```jsx
import UploadPage from './pages/UploadPage.jsx';
// inside the AppShell route group:
<Route path="/upload" element={<UploadPage />} />
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd frontend && npm test -- UploadPage.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 11: Commit**

```bash
git add frontend/src/api/readings.js frontend/src/hooks/usePollReading.js frontend/src/pages/UploadPage.jsx \
        frontend/src/App.jsx frontend/tests/hooks/usePollReading.test.jsx frontend/tests/pages/UploadPage.test.jsx
git commit -m "feat(frontend): add upload page with async processing poll"
```

---

### Task 12: Review API module + Review page

**Files:**
- Create: `frontend/src/api/review.js`
- Create: `frontend/src/pages/ReviewPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AppShell.jsx` (wire the flagged-count badge, deferred from Task 7)
- Test: `frontend/tests/pages/ReviewPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `Thumbnail`, `ConfidencePill`, `Badge`.
- Produces: `reviewApi.queue()`, `reviewApi.approve(readingId)`, `reviewApi.override(readingId, score)`, `reviewApi.stats()`. `/review` route. `AppShell`'s Review nav item now shows a live flagged-count badge sourced from `reviewApi.queue()`.

- [ ] **Step 1: Write `src/api/review.js`**

```js
import { apiClient } from './client.js';

export const reviewApi = {
  queue: () => apiClient.get('/review/queue').then((r) => r.data.items),
  approve: (readingId) => apiClient.post(`/review/${readingId}/approve`).then((r) => r.data),
  override: (readingId, score) => apiClient.post(`/review/${readingId}/override`, { score }).then((r) => r.data),
  stats: () => apiClient.get('/review/stats').then((r) => r.data),
};
```

- [ ] **Step 2: Write the failing test `tests/pages/ReviewPage.test.jsx`**

```jsx
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- ReviewPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/ReviewPage.jsx'`

- [ ] **Step 4: Write `src/pages/ReviewPage.jsx`**

```jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewApi } from '../api/review.js';
import Thumbnail from '../components/Thumbnail.jsx';
import ConfidencePill from '../components/ConfidencePill.jsx';
import Badge from '../components/Badge.jsx';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ['review-queue'], queryFn: reviewApi.queue });
  const [editingId, setEditingId] = useState(null);
  const [tempScore, setTempScore] = useState(0);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
  }

  async function approve(id) {
    await reviewApi.approve(id);
    refetch();
  }
  async function confirmOverride(id) {
    await reviewApi.override(id, tempScore);
    setEditingId(null);
    refetch();
  }

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Review Queue</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Readings needing a quick human check.</p>

      {items.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          Queue is clear &mdash; nothing needs review right now.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const editing = editingId === item.id;
          return (
            <div key={item.id} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
              <Thumbnail readingId={item.id} size={58} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 700 }}>Cow {item.cowId}</div>
                <div style={{ fontSize: '12.5px', color: '#82796a' }}>{fmtDate(item.capturedAt)}</div>
                <div style={{ fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}>{item.flagReason}</div>
              </div>
              <ConfidencePill confidence={item.confidence} />
              {editing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setTempScore((s) => Math.max(1, roundQuarter(s - 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>&minus;</button>
                  <div style={{ fontSize: 18, fontWeight: 800, minWidth: 44, textAlign: 'center' }}>{formatScore(tempScore)}</div>
                  <button onClick={() => setTempScore((s) => Math.min(5, roundQuarter(s + 0.25)))} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d8d2c2', cursor: 'pointer' }}>+</button>
                  <button onClick={() => confirmOverride(item.id)} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#1c2a20', color: '#fff', cursor: 'pointer' }}>Confirm</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '8px 12px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge score={item.score} />
                  <button onClick={() => approve(item.id)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #166534', background: '#fff', color: '#166534', fontWeight: 700, cursor: 'pointer' }}>Approve</button>
                  <button onClick={() => { setEditingId(item.id); setTempScore(item.score); }} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', cursor: 'pointer' }}>Override</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `/review` into `App.jsx`**

```jsx
import ReviewPage from './pages/ReviewPage.jsx';
// inside the AppShell route group:
<Route path="/review" element={<ReviewPage />} />
```

- [ ] **Step 6: Wire the flagged-count badge into `AppShell` (fulfilling Task 7's deferred TODO)**

Add to `src/components/AppShell.jsx`:

```jsx
import { useQuery } from '@tanstack/react-query';
import { reviewApi } from '../api/review.js';
// ...
const { data: queueItems } = useQuery({ queryKey: ['review-queue'], queryFn: reviewApi.queue });
const flaggedCount = queueItems?.length || 0;
```

Replace the plain Review `NavLink` with:

```jsx
<NavLink to="/review" style={({ isActive }) => ({ ...(isActive ? navActive : navBase), position: 'relative' })}>
  Review
  {flaggedCount > 0 && (
    <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', marginLeft: 'auto' }}>
      {flaggedCount}
    </span>
  )}
</NavLink>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npm test -- ReviewPage.test.jsx`
Expected: PASS, 3 tests

- [ ] **Step 8: Re-run AppShell's test to confirm the badge wiring didn't break it**

Run: `cd frontend && npm test -- AppShell.test.jsx`
Expected: PASS (the mocked `useAuth` from Task 7's test is unaffected; `reviewApi.queue` will hit MSW's unhandled-request default, which the test doesn't assert against, so it still passes — if it doesn't, wrap the `AppShell` test render in a `QueryClientProvider`, which Task 7's test is missing and must be added here)

Update `tests/components/AppShell.test.jsx`'s render to include `QueryClientProvider`:

```jsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// wrap the existing <MemoryRouter> in:
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
// <QueryClientProvider client={client}><MemoryRouter>...</MemoryRouter></QueryClientProvider>
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/review.js frontend/src/pages/ReviewPage.jsx frontend/src/App.jsx \
        frontend/src/components/AppShell.jsx frontend/tests/pages/ReviewPage.test.jsx frontend/tests/components/AppShell.test.jsx
git commit -m "feat(frontend): add review queue page and wire flagged-count nav badge"
```

---

### Task 13: Audit page

**Files:**
- Create: `frontend/src/api/audit.js`
- Create: `frontend/src/pages/AuditPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/AuditPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`.
- Produces: `auditApi.list(params)`. `/audit` route.

- [ ] **Step 1: Write `src/api/audit.js`**

```js
import { apiClient } from './client.js';

export const auditApi = {
  list: (params = {}) => apiClient.get('/audit', { params }).then((r) => r.data),
};
```

- [ ] **Step 2: Write the failing smoke test `tests/pages/AuditPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import AuditPage from '../../src/pages/AuditPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('AuditPage', () => {
  it('renders audit entries from the API', async () => {
    server.use(
      http.get('http://localhost:4000/api/audit', () =>
        HttpResponse.json({
          entries: [{ cowId: '4417', action: 'overridden', oldScore: 3.5, newScore: 3.25, createdAt: '2026-07-10T00:00:00Z' }],
          total: 1,
        })
      )
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuditPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('Cow 4417')).toBeInTheDocument());
    expect(screen.getByText('Overridden')).toBeInTheDocument();
  });

  it('shows the empty state with no entries', async () => {
    server.use(http.get('http://localhost:4000/api/audit', () => HttpResponse.json({ entries: [], total: 0 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuditPage /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText(/no review decisions/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- AuditPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/AuditPage.jsx'`

- [ ] **Step 4: Write `src/pages/AuditPage.jsx`**

```jsx
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit.js';
import { formatScore } from '../domain/bcs.js';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AuditPage() {
  const { data } = useQuery({ queryKey: ['audit'], queryFn: () => auditApi.list() });
  const entries = data?.entries || [];

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Audit Log</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Every approval and override.</p>

      {entries.length === 0 && (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c2', borderRadius: 12, padding: 40, textAlign: 'center', color: '#82796a' }}>
          No review decisions logged yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700 }}>Cow {entry.cowId}</div>
              <div style={{ fontSize: 12, color: '#82796a' }}>{fmtDate(entry.createdAt)}</div>
            </div>
            <span style={{
              fontSize: '11.5px', fontWeight: 700, padding: '4px 9px', borderRadius: 999,
              color: entry.action === 'overridden' ? '#b45309' : '#166534',
              background: entry.action === 'overridden' ? '#fdf1de' : '#e6f2e8',
            }}>
              {entry.action === 'overridden' ? 'Overridden' : 'Approved'}
            </span>
            <div style={{ fontSize: 13, color: '#5c5748', minWidth: 120, textAlign: 'right' }}>
              {entry.action === 'overridden'
                ? `${formatScore(entry.oldScore)} → ${formatScore(entry.newScore)}`
                : `Confirmed ${formatScore(entry.oldScore)}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `/audit` into `App.jsx`**

```jsx
import AuditPage from './pages/AuditPage.jsx';
// inside the AppShell route group:
<Route path="/audit" element={<AuditPage />} />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- AuditPage.test.jsx`
Expected: PASS, 2 tests

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/audit.js frontend/src/pages/AuditPage.jsx frontend/src/App.jsx frontend/tests/pages/AuditPage.test.jsx
git commit -m "feat(frontend): add audit log page"
```

---

### Task 14: Users API module + admin-only Users page

**Files:**
- Create: `frontend/src/api/users.js`
- Create: `frontend/src/pages/UsersPage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/tests/pages/UsersPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `RequireRole`.
- Produces: `usersApi.list()`, `usersApi.invite({email, name, role})`, `usersApi.changeRole(id, role)`, `usersApi.remove(id)`. `/users` route, gated to `role="admin"` via `RequireRole`.

- [ ] **Step 1: Write `src/api/users.js`**

```js
import { apiClient } from './client.js';

export const usersApi = {
  list: () => apiClient.get('/users').then((r) => r.data.users),
  invite: (payload) => apiClient.post('/users/invite', payload).then((r) => r.data),
  changeRole: (id, role) => apiClient.patch(`/users/${id}/role`, { role }).then((r) => r.data),
  remove: (id) => apiClient.delete(`/users/${id}`).then((r) => r.data),
};
```

- [ ] **Step 2: Write the failing smoke test `tests/pages/UsersPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import UsersPage from '../../src/pages/UsersPage.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderUsers() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><UsersPage /></QueryClientProvider>);
}

describe('UsersPage', () => {
  it('lists users and sends an invite', async () => {
    let inviteBody;
    server.use(
      http.get('http://localhost:4000/api/users', () =>
        HttpResponse.json({ users: [{ id: 'u1', name: 'Maria', email: 'maria@example.com', role: 'admin', status: 'active' }] })
      ),
      http.post('http://localhost:4000/api/users/invite', async ({ request }) => {
        inviteBody = await request.json();
        return HttpResponse.json({ user: { id: 'u2', email: inviteBody.email, name: inviteBody.name, role: inviteBody.role, status: 'pending' } }, { status: 201 });
      })
    );
    renderUsers();
    await waitFor(() => expect(screen.getByText('Maria')).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/name/i), 'New Person');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() => expect(inviteBody).toEqual({ email: 'new@example.com', name: 'New Person', role: 'staff' }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- UsersPage.test.jsx`
Expected: FAIL — `Cannot find module '../../src/pages/UsersPage.jsx'`

- [ ] **Step 4: Write `src/pages/UsersPage.jsx`**

```jsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users.js';

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [error, setError] = useState(null);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  }

  async function sendInvite(e) {
    e.preventDefault();
    setError(null);
    try {
      await usersApi.invite({ email, name, role });
      setEmail(''); setName(''); setRole('staff');
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send invite.');
    }
  }

  async function changeRole(id, newRole) {
    await usersApi.changeRole(id, newRole);
    refetch();
  }
  async function remove(id) {
    await usersApi.remove(id);
    refetch();
  }

  return (
    <div style={{ padding: '32px 28px 60px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>User Management</h1>
      <p style={{ fontSize: 14, color: '#82796a', margin: '0 0 22px' }}>Invite staff by email and manage roles.</p>

      <form onSubmit={sendInvite} style={{ background: '#fff', border: '1px solid #e5e0d3', borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Invite a user</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="invite-name" style={{ display: 'none' }}>Name</label>
          <input id="invite-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }} />
          <label htmlFor="invite-email" style={{ display: 'none' }}>Email</label>
          <input id="invite-email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2' }}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#1c2a20', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Send invite</button>
        </div>
        {error && <div style={{ background: '#fbe4e4', color: '#b91c1c', fontSize: 13, padding: '9px 12px', borderRadius: 8, marginTop: 12 }}>{error}</div>}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {users.map((u) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 16px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</div>
              <div style={{ fontSize: '12.5px', color: '#82796a' }}>{u.email}</div>
            </div>
            <span style={{
              fontSize: '11.5px', fontWeight: 700, padding: '4px 10px', borderRadius: 999,
              color: u.status === 'active' ? '#166534' : '#92600a',
              background: u.status === 'active' ? '#e6f2e8' : '#fdf3d9',
            }}>
              {u.status === 'active' ? 'Active' : 'Pending'}
            </span>
            <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #d8d2c2' }}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={() => remove(u.id)} style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid #d8d2c2', background: '#fff', color: '#b91c1c', fontWeight: 600, cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire `/users` into `App.jsx`, gated to admins**

```jsx
import UsersPage from './pages/UsersPage.jsx';
import RequireRole from './auth/RequireRole.jsx';
// inside the AppShell route group:
<Route element={<RequireRole role="admin" />}>
  <Route path="/users" element={<UsersPage />} />
</Route>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- UsersPage.test.jsx`
Expected: PASS, 1 test

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/users.js frontend/src/pages/UsersPage.jsx frontend/src/App.jsx frontend/tests/pages/UsersPage.test.jsx
git commit -m "feat(frontend): add admin-only user management page"
```

---

### Task 15: Responsive layout pass (mobile bottom nav)

**Files:**
- Modify: `frontend/src/components/AppShell.jsx`
- Create: `frontend/src/components/AppShell.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: the prototype's responsive breakpoints (sidebar collapses to a bottom tab bar under 820px, grid reflows under 480px) ported from `html-reference/BCS Tracker.dc.html` lines 20–34, since that CSS block is real, tested visual design worth keeping — not a throwaway part of the prototype.

- [ ] **Step 1: Write `src/components/AppShell.css`**

```css
@media (max-width: 820px) {
  .bcs-sidebar { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; top: auto !important;
    width: 100% !important; height: 68px !important; flex-direction: row !important; padding: 6px !important; gap: 2px !important;
    z-index: 40; box-shadow: 0 -2px 10px rgba(0,0,0,0.18); }
  .bcs-logo, .bcs-sidebar-footer { display: none !important; }
  .bcs-nav { flex-direction: column !important; flex: 1 !important; justify-content: center !important; align-items: center !important;
    padding: 6px 2px !important; font-size: 10.5px !important; gap: 3px !important; text-align: center; border-radius: 8px !important; }
  .bcs-main { padding-bottom: 78px !important; }
}
@media (max-width: 480px) {
  .bcs-grid { grid-template-columns: repeat(auto-fill, minmax(150px,1fr)) !important; gap: 12px !important; }
}
```

- [ ] **Step 2: Import the stylesheet and apply the class names in `AppShell.jsx`**

Add `import './AppShell.css';` at the top, then add `className="bcs-sidebar"` to the sidebar `<div>`, `className="bcs-logo"` to the logo `<div>`, `className="bcs-sidebar-footer"` to the two footer `<div>`s, `className="bcs-nav"` to each `NavLink`, and `className="bcs-main"` to the `<Outlet>`-wrapping `<div>`.

- [ ] **Step 3: Manual verification (no automated test — pure CSS)**

Run: `cd frontend && npm run dev`, open the app in a browser, resize the viewport below 820px, and confirm the sidebar becomes a bottom bar and the "BCS Tracker" logo / footer disappear.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AppShell.css frontend/src/components/AppShell.jsx
git commit -m "feat(frontend): port responsive sidebar/bottom-bar breakpoints from prototype"
```

---

### Task 16: End-to-end wiring check against the real backend

**Files:**
- Create: `frontend/README.md`

**Interfaces:**
- Consumes: the full stack — `frontend` (this plan), `backend` (`docs/superpowers/plans/2026-07-15-bcs-tracker-backend.md`), `ai-backend` (unmodified).
- Produces: nothing new in code — this is the final manual verification pass.

- [ ] **Step 1: Write `frontend/README.md`**

```markdown
# BCS Tracker Frontend

React frontend for BCS Tracker. Talks to the Node backend at `VITE_API_URL`
(see `backend/README.md`), which in turn calls the existing `ai-backend`
FastAPI service.

## Setup

    cp .env.example .env   # set VITE_API_URL if not http://localhost:4000/api
    npm install
    npm run dev

## Testing

    npm test

All API calls are mocked via MSW in tests — no backend needs to be running.
```

- [ ] **Step 2: Run the full test suite**

Run: `cd frontend && npm test`
Expected: PASS — every test file from Tasks 1–14

- [ ] **Step 3: Manual smoke test against the real backend + ai-backend**

```bash
# terminal 1
cd ai-backend && uvicorn app.main:app --reload --port 8000
# terminal 2
cd backend && npm run dev
# terminal 3
cd frontend && npm run dev
```

Open the frontend URL (default `http://localhost:5173`). Since there's no signup, log in with an admin seeded directly in Mongo per `backend/README.md`. Walk the golden path:
1. Log in.
2. Users page → invite a second user (requires real SMTP config in `backend/.env` to receive the email — check inbox for the invite link).
3. Upload page → enter a Cow ID, upload a real cow photo, watch it move from "Extracting…" to a scored result within ~5–30s.
4. Herd page → confirm the new cow appears with the right band color and score.
5. Cow detail → confirm the trend chart and history render.
6. If the reading was flagged, check the Review page badge count, approve or override it, then confirm it appears on the Audit page.

- [ ] **Step 4: Commit**

```bash
git add frontend/README.md
git commit -m "docs(frontend): add frontend README and manual smoke-test checklist"
```

---

## Self-Review Notes

- **Spec coverage:** all 7 screens from `docs/module-and-api-spec.md` §3 have a page + route: Login (Task 5), Upload (Task 11), Herd (Task 8), Cow Detail (Task 10), Review (Task 12), Audit (Task 13), Users (Task 14). The App Shell's sidebar/theme/responsive behavior (Tasks 7, 15) matches §3's "Shell" row. The demo role-switcher is explicitly dropped per §3's note and the Global Constraints.
- **Type/name consistency verified:** `formatScore`/`bandFor`/`confidenceStyleFor` (Task 2) are the single source of truth and are imported — never reimplemented — by Badge (8), ConfidencePill (9), CowDetailPage (10), UploadPage (11), ReviewPage (12), AuditPage (13). `usePollReading`'s return shape `{reading, isDone}` (Task 11) matches exactly how UploadPage consumes it. `AppShell`'s Task 7 placeholder badge (documented as wired later) is genuinely completed in Task 12, not left dangling — Task 12 Step 8 explicitly patches Task 7's test to add the `QueryClientProvider` its render was missing.
- **No placeholders:** confirmed — every step has complete, runnable code.
