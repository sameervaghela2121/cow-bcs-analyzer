import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { cowsApi } from '../api/cows.js';

// No aggregate/stats endpoint exists on the backend, and this dashboard is
// built without adding one - so "every analysis in the herd" is assembled
// client-side: one /cows call for the roster, then one /cows/:id/analyses
// call per cow, fanned out in parallel via useQueries. That's O(cows)
// requests, which is fine at the herd sizes this app runs at today; if the
// herd grows into the hundreds+ this should move to a real backend
// aggregation instead of scaling the fan-out further.
export function useDashboardData() {
  const { data: cowsData, isLoading: cowsLoading } = useQuery({
    queryKey: ['cows-all'],
    queryFn: () => cowsApi.list({ limit: 1000 }),
  });
  const cows = cowsData?.cows || [];

  const analysesQueries = useQueries({
    queries: cows.map((cow) => ({
      queryKey: ['cow-analyses', cow.cowsId],
      queryFn: () => cowsApi.analyses(cow.cowsId, { limit: 200 }),
      enabled: !!cow.cowsId,
    })),
  });
  const analysesLoading = cows.length > 0 && analysesQueries.some((q) => q.isLoading);
  const allAnalyses = useMemo(
    () => analysesQueries.flatMap((q) => q.data?.bcsAnalyses || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysesQueries.map((q) => q.dataUpdatedAt).join(',')]
  );

  return { cows, allAnalyses, isLoading: cowsLoading || analysesLoading };
}
