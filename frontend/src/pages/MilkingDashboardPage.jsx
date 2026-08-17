import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { milkingDataApi } from '../api/milkingData.js';
import { PageHeader } from '../components/ui/index.js';
import StatCards from '../components/milking/StatCards.jsx';
import ProductionChart from '../components/milking/ProductionChart.jsx';
import MilkingFilterBar from '../components/milking/MilkingFilterBar.jsx';
import MilkingRecordsTable from '../components/milking/MilkingRecordsTable.jsx';
import { color, radius, softTint } from '../styles/tokens.js';

const PAGE_SIZE = 50;

// Default to the trailing 30 days when the page first loads with no
// startDate/endDate in the URL - matches the dashboard's "overview chart
// first, then filter" flow the facility-admin/staff use case calls for.
function defaultDateRange() {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function MilkingDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showByShift, setShowByShift] = useState(false);

  const defaults = defaultDateRange();
  const startDate = searchParams.get('startDate') || defaults.startDate;
  const endDate = searchParams.get('endDate') || defaults.endDate;
  const groupId = searchParams.get('groupId') || undefined;
  const cowId = searchParams.get('cowId') || undefined;
  const shift = searchParams.get('shift') || undefined;
  const sortBy = searchParams.get('sortBy') || 'date';
  const sortOrder = searchParams.get('sortOrder') || 'desc';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const filterParams = { startDate, endDate, groupId, cowId, shift };

  const { data: summaryData, isLoading: summaryLoading, isError: summaryIsError, error: summaryError } = useQuery({
    queryKey: ['milking-summary', filterParams],
    queryFn: () => milkingDataApi.summary(filterParams),
    staleTime: 30000,
  });

  const { data: recordsData, isLoading: recordsLoading, isError: recordsIsError, error: recordsError } = useQuery({
    queryKey: ['milking-records', { ...filterParams, sortBy, sortOrder, limit: PAGE_SIZE, offset }],
    queryFn: () => milkingDataApi.records({ ...filterParams, sortBy, sortOrder, limit: PAGE_SIZE, offset }),
  });

  // This is a production-reporting screen, so an API failure must never be
  // rendered as indistinguishable from a facility that legitimately has
  // zero records - stats?.[key] ?? 0 / the chart's empty state / the
  // table's "No records found." all look identical to a real 400 (e.g. an
  // invalid date range or a cowId that doesn't belong to this facility)
  // unless we surface it explicitly (Finding 5).
  const isError = summaryIsError || recordsIsError;
  const errorMessage =
    summaryError?.response?.data?.error || recordsError?.response?.data?.error || 'Failed to load milking data.';

  function updateParams(mutate) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      mutate(next);
      return next;
    });
  }

  function handleFilterChange(field, value) {
    updateParams((next) => {
      if (value === undefined || value === '') next.delete(field);
      else next.set(field, value);
      next.delete('page'); // a new filter invalidates whatever page we were on

      // Group and Cow are mutually exclusive server-side -
      // buildFacilityScopedMatch ignores groupId entirely whenever cowId is
      // present (intentional backend precedence, not being changed here).
      // Mirror that in the UI so picking one always visibly deselects the
      // other, instead of silently overriding it with no indication (Finding 3).
      if (field === 'cowId' && value) next.delete('groupId');
      if (field === 'groupId' && value) next.delete('cowId');

      // Prevent the most common trigger of a silent-looking empty dashboard:
      // the backend 400s on startDate > endDate. Judgment call (not fully
      // specified by the brief): clamp the *other* date to match the one the
      // user just picked, rather than reject the edit outright - simplest
      // change that keeps the range valid without silently discarding input.
      if (field === 'startDate' && value) {
        const currentEnd = next.get('endDate') || endDate;
        if (currentEnd && value > currentEnd) next.set('endDate', value);
      }
      if (field === 'endDate' && value) {
        const currentStart = next.get('startDate') || startDate;
        if (currentStart && value < currentStart) next.set('startDate', value);
      }
    });
  }

  function handlePageChange(newPage) {
    updateParams((next) => {
      if (newPage <= 1) next.delete('page');
      else next.set('page', String(newPage));
    });
  }

  function handleSortChange(field, order) {
    updateParams((next) => {
      next.set('sortBy', field);
      next.set('sortOrder', order);
      next.delete('page');
    });
  }

  return (
    <div style={{ padding: '32px 32px 60px' }}>
      <PageHeader title="Milking Dashboard" />
      {isError && (
        <div
          role="alert"
          style={{ ...softTint(color.danger), fontSize: 13, fontWeight: 500, padding: '10px 14px', borderRadius: radius.input, marginBottom: 16 }}
        >
          {errorMessage}
        </div>
      )}
      <StatCards stats={summaryData?.stats} isLoading={summaryLoading} />
      <ProductionChart
        daily={summaryData?.daily}
        isLoading={summaryLoading}
        showByShift={showByShift}
        onToggleByShift={() => setShowByShift((v) => !v)}
      />
      <MilkingFilterBar
        startDate={startDate}
        endDate={endDate}
        groupId={groupId}
        cowId={cowId}
        shift={shift}
        onFilterChange={handleFilterChange}
      />
      <MilkingRecordsTable
        records={recordsData?.records ?? []}
        total={recordsData?.total ?? 0}
        limit={PAGE_SIZE}
        offset={offset}
        sortBy={sortBy}
        sortOrder={sortOrder}
        isLoading={recordsLoading}
        onPageChange={handlePageChange}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
