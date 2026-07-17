import { useQuery } from '@tanstack/react-query';
import { bcsAnalysisApi } from '../api/bcsAnalysis.js';

const PENDING_STATUSES = new Set(['not_started', 'processing']);

export function usePollBcsAnalysis(analysisId) {
  const { data: analysis } = useQuery({
    queryKey: ['bcsAnalysis', analysisId],
    queryFn: () => bcsAnalysisApi.get(analysisId),
    enabled: !!analysisId,
    refetchInterval: (query) => (PENDING_STATUSES.has(query.state.data?.status) ? 10000 : false),
  });

  return { analysis, isDone: !!analysis && !PENDING_STATUSES.has(analysis.status) };
}
