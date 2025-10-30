import { useQuery } from '@tanstack/react-query';

import { getEventProgress, type EventProgress } from '@/lib/eventsApi';

export function useEventProgress(eventId: number) {
  return useQuery<EventProgress>({
    queryKey: ['event-progress', eventId],
    queryFn: () => getEventProgress(eventId),
    staleTime: 15_000,
    refetchInterval: false,
  });
}

