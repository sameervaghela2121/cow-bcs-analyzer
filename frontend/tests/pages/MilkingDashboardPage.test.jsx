import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import MilkingDashboardPage from '../../src/pages/MilkingDashboardPage.jsx';
import { AuthProvider } from '../../src/auth/AuthContext.jsx';

// jsdom has no ResizeObserver and always reports a zero getBoundingClientRect,
// so recharts' ResponsiveContainer never sizes its chart children without this
// stub - not a component bug, just a jsdom limitation (same stub as
// ProductionChart.test.jsx, needed here since this page renders that chart).
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () => ({
    width: 600,
    height: 280,
    top: 0,
    left: 0,
    bottom: 280,
    right: 600,
    x: 0,
    y: 0,
    toJSON() {},
  });
});

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-17T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

function renderPage(initialEntries = ['/milking']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/milking" element={<MilkingDashboardPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const dailyFixture = [
  { date: '2026-08-10', totalMilk: 1024.5, recordCount: 150, byShift: { Morning: 342.1, Afternoon: 341.2, Evening: 341.2 } },
  { date: '2026-08-11', totalMilk: 998.2, recordCount: 148, byShift: { Morning: 330.0, Afternoon: 334.2, Evening: 334.0 } },
];

const statsFixture = { totalMilk: 2022.7, recordCount: 298, cowsReporting: 42, groupsActive: 3, avgPerCow: 48.2 };

const recordsFixture = [
  { id: 'r1', cowsId: '4417', currentGroup: 'Milking Herd', shift: 'Morning', milk: 12.5, milkSessionAt: '2026-08-11T06:00:00Z', createdAt: '2026-08-11T06:05:00Z' },
  { id: 'r2', cowsId: '5001', currentGroup: 'Fresh Cows', shift: 'Evening', milk: 10.2, milkSessionAt: '2026-08-11T18:00:00Z', createdAt: '2026-08-11T18:05:00Z' },
];

const groupsFixture = [
  { id: 'g1', name: 'Milking Herd' },
  { id: 'g2', name: 'Fresh Cows' },
];

const cowsFixture = [
  { id: 'c1', cowsId: '4417' },
  { id: 'c2', cowsId: '5001' },
];

function mockAll({ daily = dailyFixture, stats = statsFixture, records = recordsFixture, total = records.length, onSummary, onRecords } = {}) {
  server.use(
    http.get('http://localhost:4000/api/milking-data/summary', ({ request }) => {
      onSummary?.(request);
      return HttpResponse.json({ daily, stats });
    }),
    http.get('http://localhost:4000/api/milking-data/records', ({ request }) => {
      onRecords?.(request);
      return HttpResponse.json({ records, total, limit: 50, offset: 0 });
    }),
    http.get('http://localhost:4000/api/cow-groups', () => HttpResponse.json({ cowGroups: groupsFixture })),
    http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows: cowsFixture, total: cowsFixture.length }))
  );
}

describe('MilkingDashboardPage', () => {
  it('renders the full page from API data (stats, chart, filter options, table rows)', async () => {
    mockAll();
    renderPage();

    // Stat tiles
    await waitFor(() => expect(screen.getByText('2022.7 L')).toBeInTheDocument());
    expect(screen.getByText('48.2 L')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Chart container rendered (not skeleton/empty state)
    expect(document.querySelector('svg')).toBeTruthy();

    // Filter dropdown options populated from cow-groups/cows
    await waitFor(() => expect(screen.getByRole('option', { name: 'Milking Herd' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Fresh Cows' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '4417' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '5001' })).toBeInTheDocument();

    // Table rows rendered from records
    expect(await screen.findByText('12.50')).toBeInTheDocument();
    expect(screen.getByText('10.20')).toBeInTheDocument();
  });

  it('defaults to the trailing 30-day range on first load', async () => {
    let summaryParams;
    let recordsParams;
    mockAll({
      onSummary: (req) => { summaryParams = new URL(req.url).searchParams; },
      onRecords: (req) => { recordsParams = new URL(req.url).searchParams; },
    });
    renderPage();

    await waitFor(() => expect(summaryParams).toBeTruthy());
    expect(summaryParams.get('startDate')).toBe('2026-07-18');
    expect(summaryParams.get('endDate')).toBe('2026-08-17');
    await waitFor(() => expect(recordsParams).toBeTruthy());
    expect(recordsParams.get('startDate')).toBe('2026-07-18');
    expect(recordsParams.get('endDate')).toBe('2026-08-17');
  });

  it('selecting a shift filter triggers a new API call with that filter', async () => {
    const seenShifts = [];
    mockAll({
      onSummary: (req) => seenShifts.push(new URL(req.url).searchParams.get('shift')),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Milking Herd' })).toBeInTheDocument());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText('Shift'), 'Morning');

    await waitFor(() => expect(seenShifts).toContain('Morning'));
  });

  it('changing a filter resets pagination to page 1', async () => {
    const seenOffsets = [];
    mockAll({
      total: 120,
      onRecords: (req) => seenOffsets.push(new URL(req.url).searchParams.get('offset')),
    });
    renderPage(['/milking?page=3']);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Milking Herd' })).toBeInTheDocument());
    await waitFor(() => expect(seenOffsets).toContain('100'));

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText('Shift'), 'Evening');

    await waitFor(() => {
      const last = seenOffsets[seenOffsets.length - 1];
      expect(last === null || last === '0').toBe(true);
    });
  });

  it('clicking table pagination "Next" updates the records query offset', async () => {
    const seenOffsets = [];
    mockAll({
      total: 120,
      onRecords: (req) => seenOffsets.push(new URL(req.url).searchParams.get('offset')),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Page 1 of 3')).toBeInTheDocument());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() => expect(seenOffsets).toContain('50'));
  });

  it('mounts without throwing at the /milking route', async () => {
    mockAll();
    renderPage();
    await waitFor(() => expect(screen.getByText('Milking Dashboard')).toBeInTheDocument());
  });

  it('selecting a cow then a group drops cowId from the request, keeping only groupId (Finding 3)', async () => {
    const seenRecordsParams = [];
    mockAll({
      onRecords: (req) => seenRecordsParams.push(new URL(req.url).searchParams),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '4417' })).toBeInTheDocument());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText('Cow'), 'c1');
    await waitFor(() => expect(seenRecordsParams[seenRecordsParams.length - 1].get('cowId')).toBe('c1'));

    await user.selectOptions(screen.getByLabelText('Group'), 'g1');
    await waitFor(() => {
      const last = seenRecordsParams[seenRecordsParams.length - 1];
      expect(last.get('groupId')).toBe('g1');
      expect(last.get('cowId')).toBeNull();
    });
  });

  it('selecting a group then a cow drops groupId from the request, keeping only cowId (Finding 3)', async () => {
    const seenRecordsParams = [];
    mockAll({
      onRecords: (req) => seenRecordsParams.push(new URL(req.url).searchParams),
    });
    renderPage();
    await waitFor(() => expect(screen.getByRole('option', { name: '4417' })).toBeInTheDocument());

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.selectOptions(screen.getByLabelText('Group'), 'g1');
    await waitFor(() => expect(seenRecordsParams[seenRecordsParams.length - 1].get('groupId')).toBe('g1'));

    await user.selectOptions(screen.getByLabelText('Cow'), 'c1');
    await waitFor(() => {
      const last = seenRecordsParams[seenRecordsParams.length - 1];
      expect(last.get('cowId')).toBe('c1');
      expect(last.get('groupId')).toBeNull();
    });
  });

  it('renders a visible error message instead of silent zeros when the summary request fails (Finding 5)', async () => {
    server.use(
      http.get('http://localhost:4000/api/milking-data/summary', () =>
        HttpResponse.json({ error: 'startDate must not be after endDate.' }, { status: 400 })
      ),
      http.get('http://localhost:4000/api/milking-data/records', () =>
        HttpResponse.json({ records: recordsFixture, total: recordsFixture.length, limit: 50, offset: 0 })
      ),
      http.get('http://localhost:4000/api/cow-groups', () => HttpResponse.json({ cowGroups: groupsFixture })),
      http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows: cowsFixture, total: cowsFixture.length }))
    );
    renderPage();

    // The server's actual error message is now visible on the page, rather
    // than the request silently failing and the dashboard rendering as an
    // indistinguishable-looking zero-production facility.
    expect(await screen.findByText('startDate must not be after endDate.')).toBeInTheDocument();
  });
});
