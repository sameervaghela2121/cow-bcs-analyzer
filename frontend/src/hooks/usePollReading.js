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
