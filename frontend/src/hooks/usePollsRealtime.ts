import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useRealtimeStatusSetter } from '@/context/realtimeStatus';
import { useEventChannel, type EventChannelMessage } from '@/hooks/useEventChannel';
import { getPoll } from '@/lib/pollsApi';
import type { Poll, PollOption } from '@/types/poll';

type PollListCache = {
  results: Poll[];
  count: number;
};

type FilterValue = 'all' | 'open' | 'closed';

type PollOptionDelta = {
  id: number;
  votes_count: number;
};

type PollCreatedPayload = {
  event_id: number;
  poll: {
    id: number;
    type: Poll['type'];
    question: string;
    multiple: boolean;
    allow_change_vote: boolean;
    is_closed: boolean;
    end_at: string | null;
    created_at?: string | null;
    my_votes?: number[];
    options: Array<{
      id: number;
      label: string | null;
      date_value: string | null;
      votes_count: number;
    }>;
    total_votes: number;
    leader_option_ids: number[];
  };
  version: number;
};

type UsePollsRealtimeOptions = {
  eventId: number | null;
  pageSize: number;
};

const isDevelopment = process.env.NODE_ENV !== 'production';

const matchesFilter = (filter: FilterValue, poll: Poll): boolean => {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'open') {
    return poll.isClosed === false;
  }
  return poll.isClosed === true;
};

const mapRealtimeOption = (option: {
  id: number;
  label: string | null;
  date_value: string | null;
  votes_count: number;
}): PollOption => ({
  id: option.id,
  label: option.label ?? undefined,
  dateValue: option.date_value ?? undefined,
  votesCount: option.votes_count,
});

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function usePollsRealtime({ eventId, pageSize }: UsePollsRealtimeOptions): ReturnType<typeof useEventChannel>['status'] {
  const queryClient = useQueryClient();
  const setRealtimeStatus = useRealtimeStatusSetter();
  const { status, subscribe } = useEventChannel(eventId ?? 0);
  const pendingRefetchesRef = useRef(new Set<number>());

  const filterQueryKey = useMemo(() => (eventId ? ['polls', eventId] : undefined), [eventId]);

  const getKnownPoll = useCallback(
    (pollId: number): Poll | undefined => {
      const detail = queryClient.getQueryData<Poll>(['poll', pollId]);
      if (detail) {
        return detail;
      }
      if (!filterQueryKey) {
        return undefined;
      }
      const candidates = queryClient.getQueriesData<PollListCache>({ queryKey: filterQueryKey, exact: false });
      for (const [, data] of candidates) {
        const found = data?.results.find((item) => item.id === pollId);
        if (found) {
          return found;
        }
      }
      return undefined;
    },
    [filterQueryKey, queryClient],
  );

  const upsertPollInLists = useCallback(
    (nextPoll: Poll, previousPoll?: Poll | null) => {
      if (!filterQueryKey) {
        return;
      }
      const queries = queryClient.getQueriesData<PollListCache>({ queryKey: filterQueryKey, exact: false });
      for (const [queryKey, data] of queries) {
        if (!Array.isArray(queryKey) || queryKey.length < 4) {
          continue;
        }
        const [, keyEventId, rawFilter, rawPage] = queryKey;
        if (keyEventId !== eventId) {
          continue;
        }
        if (rawFilter !== 'all' && rawFilter !== 'open' && rawFilter !== 'closed') {
          continue;
        }
        const filter = rawFilter as FilterValue;
        const page = typeof rawPage === 'number' && Number.isFinite(rawPage) ? rawPage : 1;
        if (!data) {
          continue;
        }

        const prevMatches = previousPoll ? matchesFilter(filter, previousPoll) : false;
        const nextMatches = matchesFilter(filter, nextPoll);

        const existingIndex = data.results.findIndex((item) => item.id === nextPoll.id);
        let nextResults = data.results;
        let nextCount = data.count;

        if (nextMatches && !prevMatches) {
          nextCount += 1;
        } else if (!nextMatches && prevMatches && data.count > 0) {
          nextCount -= 1;
        }

        if (nextMatches) {
          if (existingIndex >= 0) {
            const existing = data.results[existingIndex];
            const merged: Poll = {
              ...existing,
              ...nextPoll,
              myVotes: nextPoll.myVotes,
            };
            const shouldUpdate =
              existing.version !== merged.version ||
              existing.totalVotes !== merged.totalVotes ||
              existing.isClosed !== merged.isClosed ||
              existing.leaderOptionIds !== merged.leaderOptionIds ||
              existing.options !== merged.options;
            if (shouldUpdate) {
              nextResults = [...data.results];
              nextResults[existingIndex] = merged;
            }
          } else if (page === 1) {
            nextResults = [nextPoll, ...data.results];
            if (nextResults.length > pageSize) {
              nextResults = nextResults.slice(0, pageSize);
            }
          }
        } else if (existingIndex >= 0) {
          nextResults = data.results.filter((item) => item.id !== nextPoll.id);
        }

        if (nextResults !== data.results || nextCount !== data.count) {
          queryClient.setQueryData(queryKey, { ...data, results: nextResults, count: Math.max(0, nextCount) });
        }
      }
    },
    [eventId, filterQueryKey, pageSize, queryClient],
  );

  const removePollFromLists = useCallback(
    (pollId: number, previousPoll?: Poll) => {
      if (!filterQueryKey) {
        return;
      }
      const queries = queryClient.getQueriesData<PollListCache>({ queryKey: filterQueryKey, exact: false });
      for (const [queryKey, data] of queries) {
        if (!Array.isArray(queryKey) || queryKey.length < 4) {
          continue;
        }
        const [, keyEventId, rawFilter] = queryKey;
        if (keyEventId !== eventId) {
          continue;
        }
        if (rawFilter !== 'all' && rawFilter !== 'open' && rawFilter !== 'closed') {
          continue;
        }
        if (!data) {
          continue;
        }
        const filter = rawFilter as FilterValue;
        const prevMatches = previousPoll ? matchesFilter(filter, previousPoll) : data.results.some((item) => item.id === pollId);
        const existingIndex = data.results.findIndex((item) => item.id === pollId);

        let nextResults = data.results;
        let nextCount = data.count;

        if (existingIndex >= 0) {
          nextResults = data.results.filter((item) => item.id !== pollId);
        }
        if (prevMatches && data.count > 0) {
          nextCount -= 1;
        }

        if (nextResults !== data.results || nextCount !== data.count) {
          queryClient.setQueryData(queryKey, { ...data, results: nextResults, count: Math.max(0, nextCount) });
        }
      }
    },
    [eventId, filterQueryKey, queryClient],
  );

  const refetchPoll = useCallback(
    async (pollId: number) => {
      if (!eventId) {
        return;
      }
      if (pendingRefetchesRef.current.has(pollId)) {
        return;
      }
      pendingRefetchesRef.current.add(pollId);
      try {
        const previous = getKnownPoll(pollId) ?? null;
        const freshPoll = await queryClient.fetchQuery({
          queryKey: ['poll', pollId],
          queryFn: () => getPoll(pollId),
          staleTime: 30_000,
        });
        upsertPollInLists(freshPoll, previous);
      } catch (error) {
        if (isDevelopment) {
          console.warn('Failed to refetch poll state', { pollId, error });
        }
      } finally {
        pendingRefetchesRef.current.delete(pollId);
      }
    },
    [eventId, getKnownPoll, queryClient, upsertPollInLists],
  );

  const buildCreatedPoll = useCallback(
    (payload: PollCreatedPayload, previous?: Poll | null): Poll => {
      const basePoll: Poll = {
        id: payload.poll.id,
        event: payload.event_id,
        type: payload.poll.type,
        question: payload.poll.question,
        multiple: payload.poll.multiple,
        allowChangeVote: payload.poll.allow_change_vote,
        isClosed: payload.poll.is_closed,
        endAt: payload.poll.end_at ?? null,
        createdAt: payload.poll.created_at ?? previous?.createdAt ?? new Date().toISOString(),
        options: payload.poll.options.map(mapRealtimeOption),
        totalVotes: payload.poll.total_votes,
        myVotes: payload.poll.my_votes?.map((value) => Number(value)) ?? previous?.myVotes ?? [],
        leaderOptionIds: payload.poll.leader_option_ids,
        version: payload.version,
      };
      return previous
        ? {
            ...previous,
            ...basePoll,
          }
        : basePoll;
    },
    [],
  );

  const handlePollCreated = useCallback(
    (payload: unknown) => {
      if (!eventId || !isObject(payload)) {
        return;
      }
      const eventIdValue = coerceNumber(payload.event_id);
      const pollData = isObject(payload.poll) ? payload.poll : null;
      const versionValue = coerceNumber(payload.version);
      if (eventIdValue === null || versionValue === null || pollData === null) {
        return;
      }
      if (eventIdValue !== eventId) {
        return;
      }
      const pollId = coerceNumber(pollData.id);
      if (pollId === null || typeof pollData.type !== 'string' || typeof pollData.question !== 'string') {
        return;
      }
      const previous = getKnownPoll(pollId);
      const createdPoll = buildCreatedPoll(
        {
          event_id: eventIdValue,
          poll: {
            id: pollId,
            type: pollData.type as Poll['type'],
            question: pollData.question,
            multiple: Boolean(pollData.multiple),
            allow_change_vote: Boolean(pollData.allow_change_vote),
            is_closed: Boolean(pollData.is_closed),
            end_at: typeof pollData.end_at === 'string' || pollData.end_at === null ? pollData.end_at : null,
            created_at: typeof pollData.created_at === 'string' ? pollData.created_at : null,
            my_votes: Array.isArray(pollData.my_votes)
              ? pollData.my_votes.map((value) => Number(value)).filter((value) => Number.isFinite(value))
              : [],
            options: Array.isArray(pollData.options)
              ? pollData.options
                  .map((option) => (isObject(option) ? option : null))
                  .filter((option): option is PollCreatedPayload['poll']['options'][number] => option !== null)
              : [],
            total_votes: coerceNumber(pollData.total_votes) ?? 0,
            leader_option_ids: Array.isArray(pollData.leader_option_ids)
              ? pollData.leader_option_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
              : [],
          },
          version: versionValue,
        },
        previous ?? null,
      );

      queryClient.setQueryData(['poll', createdPoll.id], createdPoll);
      upsertPollInLists(createdPoll, previous ?? null);
      if (isDevelopment) {
        console.debug('[polls] poll.created', payload);
      }
    },
    [buildCreatedPoll, eventId, getKnownPoll, queryClient, upsertPollInLists],
  );

  const handlePollUpdated = useCallback(
    (payload: unknown) => {
      if (!eventId || !isObject(payload)) {
        return;
      }
      const eventIdValue = coerceNumber(payload.event_id);
      const pollId = coerceNumber(payload.poll_id);
      const versionValue = coerceNumber(payload.version);
      if (eventIdValue === null || pollId === null || versionValue === null || eventIdValue !== eventId) {
        return;
      }
      const optionDeltas = Array.isArray(payload.options)
        ? payload.options
            .map((option) => (isObject(option) ? option : null))
            .filter((option): option is PollOptionDelta => option !== null && coerceNumber(option.id) !== null)
            .map((option) => ({
              id: Number(option.id),
              votes_count: coerceNumber(option.votes_count) ?? 0,
            }))
        : [];
      const totalVotes = coerceNumber(payload.total_votes) ?? 0;
      const leaderIds = Array.isArray(payload.leader_option_ids)
        ? payload.leader_option_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];

      const previous = getKnownPoll(pollId);
      if (!previous) {
        void refetchPoll(pollId);
        return;
      }
      if (versionValue <= previous.version) {
        return;
      }
      if (versionValue > previous.version + 1) {
        void refetchPoll(pollId);
        return;
      }

      const nextOptions = previous.options.map((option) => {
        const delta = optionDeltas.find((item) => item.id === option.id);
        return delta ? { ...option, votesCount: delta.votes_count } : option;
      });

      const unknownDelta = optionDeltas.some((delta) => !previous.options.some((option) => option.id === delta.id));
      if (unknownDelta) {
        void refetchPoll(pollId);
        return;
      }

      const updatedPoll: Poll = {
        ...previous,
        options: nextOptions,
        totalVotes,
        leaderOptionIds: leaderIds,
        version: versionValue,
      };

      queryClient.setQueryData(['poll', pollId], updatedPoll);
      upsertPollInLists(updatedPoll, previous);
      if (isDevelopment) {
        console.debug('[polls] poll.updated', payload);
      }
    },
    [eventId, getKnownPoll, queryClient, refetchPoll, upsertPollInLists],
  );

  const handlePollClosed = useCallback(
    (payload: unknown) => {
      if (!eventId || !isObject(payload)) {
        return;
      }
      const eventIdValue = coerceNumber(payload.event_id);
      const pollId = coerceNumber(payload.poll_id);
      const versionValue = coerceNumber(payload.version);
      if (eventIdValue === null || pollId === null || versionValue === null || eventIdValue !== eventId) {
        return;
      }
      const previous = getKnownPoll(pollId);
      if (!previous) {
        void refetchPoll(pollId);
        return;
      }
      if (versionValue <= previous.version) {
        return;
      }
      if (versionValue > previous.version + 1) {
        void refetchPoll(pollId);
        return;
      }
      const updatedPoll: Poll = {
        ...previous,
        isClosed: true,
        version: versionValue,
      };
      queryClient.setQueryData(['poll', pollId], updatedPoll);
      upsertPollInLists(updatedPoll, previous);
      if (isDevelopment) {
        console.debug('[polls] poll.closed', payload);
      }
    },
    [eventId, getKnownPoll, queryClient, refetchPoll, upsertPollInLists],
  );

  const handlePollDeleted = useCallback(
    (payload: unknown) => {
      if (!eventId || !isObject(payload)) {
        return;
      }
      const eventIdValue = coerceNumber(payload.event_id);
      const pollId = coerceNumber(payload.poll_id);
      if (eventIdValue === null || pollId === null || eventIdValue !== eventId) {
        return;
      }
      const previous = getKnownPoll(pollId);
      queryClient.removeQueries({ queryKey: ['poll', pollId], exact: true });
      removePollFromLists(pollId, previous);
      if (isDevelopment) {
        console.debug('[polls] poll.deleted', payload);
      }
    },
    [eventId, getKnownPoll, queryClient, removePollFromLists],
  );

  const handleMessage = useCallback(
    (message: EventChannelMessage) => {
      if (!message?.type?.startsWith('poll.') || !eventId) {
        return;
      }
      if (message.type === 'poll.created') {
        handlePollCreated(message.payload);
      } else if (message.type === 'poll.updated') {
        handlePollUpdated(message.payload);
      } else if (message.type === 'poll.closed') {
        handlePollClosed(message.payload);
      } else if (message.type === 'poll.deleted') {
        handlePollDeleted(message.payload);
      }
    },
    [eventId, handlePollClosed, handlePollCreated, handlePollDeleted, handlePollUpdated],
  );

  useEffect(() => {
    setRealtimeStatus(status);
    return () => {
      setRealtimeStatus('disconnected');
    };
  }, [setRealtimeStatus, status]);

  useEffect(() => {
    if (!eventId || eventId <= 0) {
      return;
    }
    return subscribe(handleMessage);
  }, [eventId, handleMessage, subscribe]);

  return status;
}

