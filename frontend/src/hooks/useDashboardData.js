import { useQuery } from '@tanstack/react-query';
import { cowsApi } from '../api/cows.js';
import { bcsAnalysisApi } from '../api/bcsAnalysis.js';

// Two requests total, flat regardless of herd size: the cow roster, and
// every analysis in the facility via one backend aggregation
// (dashboard-summary) rather than firing /cows/:id/analyses once per cow.
// That used to be O(cows) requests, each of which also generated 3 signed
// GCS URLs per image for data these charts never render - hundreds of
// wasted, slow round-trips on any herd of meaningful size.
export function useDashboardData() {
  const { data: cowsData, isLoading: cowsLoading } = useQuery({
    queryKey: ['cows-all'],
    queryFn: () => cowsApi.list({ limit: 1000 }),
  });
  const { data: analysesData, isLoading: analysesLoading } = useQuery({
    queryKey: ['dashboard-analyses'],
    queryFn: () => bcsAnalysisApi.dashboardSummary(),
  });

  const cows = cowsData?.cows || [];
  const allAnalyses = analysesData?.analyses || [];

  return { cows, allAnalyses, isLoading: cowsLoading || analysesLoading };
}
