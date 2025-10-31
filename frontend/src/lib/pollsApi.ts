import { apiFetch } from '@/lib/fetcher';
import type { Poll, PollOption, PollType } from '@/types/poll';

type ApiPollOption = {
  id: number;
  label: string | null;
  date_value: string | null;
  votes_count: number;
};

type ApiPoll = {
  id: number;
  event: number;
  type: PollType;
  question: string;
  multiple: boolean;
  allow_change_vote: boolean;
  is_closed: boolean;
  end_at: string | null;
  created_at: string;
  options: ApiPollOption[];
  total_votes: number;
  my_votes: number[];
  leader_option_ids: number[];
};

type ApiPollListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ApiPoll[];
};

type CreatePollOptionInput = {
  label?: string;
  dateValue?: string;
};

const mapOption = (payload: ApiPollOption): PollOption => ({
  id: payload.id,
  label: payload.label ?? undefined,
  dateValue: payload.date_value ?? undefined,
  votesCount: payload.votes_count,
});

const mapPoll = (payload: ApiPoll): Poll => ({
  id: payload.id,
  event: payload.event,
  type: payload.type,
  question: payload.question,
  multiple: payload.multiple,
  allowChangeVote: payload.allow_change_vote,
  isClosed: payload.is_closed,
  endAt: payload.end_at,
  createdAt: payload.created_at,
  options: payload.options.map(mapOption),
  totalVotes: payload.total_votes,
  myVotes: payload.my_votes,
  leaderOptionIds: payload.leader_option_ids,
});

export async function listPolls(
  eventId: number,
  params?: { isClosed?: boolean; page?: number },
): Promise<{ results: Poll[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.isClosed !== undefined) {
    query.set('is_closed', String(params.isClosed));
  }
  if (params?.page) {
    query.set('page', String(params.page));
  }
  const queryString = query.toString();
  const url = queryString.length > 0 ? `/api/events/${eventId}/polls?${queryString}` : `/api/events/${eventId}/polls`;

  const response = await apiFetch<ApiPollListResponse>(url, { method: 'GET' });
  return {
    count: response.count,
    results: response.results.map(mapPoll),
  };
}

export async function getPoll(pollId: number): Promise<Poll> {
  const response = await apiFetch<ApiPoll>(`/api/polls/${pollId}`, { method: 'GET' });
  return mapPoll(response);
}

export async function createPoll(
  eventId: number,
  payload: {
    type: PollType;
    question: string;
    multiple: boolean;
    allowChangeVote: boolean;
    endAt?: string | null;
    options: CreatePollOptionInput[];
  },
): Promise<Poll> {
  const body = JSON.stringify({
    type: payload.type,
    question: payload.question,
    multiple: payload.multiple,
    allow_change_vote: payload.allowChangeVote,
    end_at: payload.endAt ?? null,
    options: payload.options.map((option) => ({
      label: option.label,
      date_value: option.dateValue,
    })),
  });

  const response = await apiFetch<ApiPoll>(`/api/events/${eventId}/polls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  return mapPoll(response);
}

export async function vote(pollId: number, optionIds: number[]): Promise<Poll> {
  const body = JSON.stringify({ option_ids: optionIds });
  const response = await apiFetch<ApiPoll>(`/api/polls/${pollId}/vote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  return mapPoll(response);
}

export async function closePoll(pollId: number): Promise<void> {
  await apiFetch(`/api/polls/${pollId}/close`, {
    method: 'POST',
  });
}

export async function deletePoll(pollId: number): Promise<void> {
  await apiFetch(`/api/polls/${pollId}`, {
    method: 'DELETE',
  });
}
