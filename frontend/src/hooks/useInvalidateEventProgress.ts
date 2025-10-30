import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export function useInvalidateEventProgress(eventId: number) {
  const queryClient = useQueryClient();

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['event-progress', eventId] }),
    [queryClient, eventId],
  );
}
