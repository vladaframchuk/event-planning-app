import { apiFetch } from '@/lib/fetcher';
import type { Event, EventInput, EventOwner } from '@/types/event';

type GetMyEventsParams = {
  search?: string;
  category?: string;
  upcoming?: boolean;
  ordering?: string;
  page?: number;
};

type ApiEvent = {
  id: number;
  title: string;
  category: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  owner: EventOwner;
  created_at: string;
  updated_at: string;
};

type ApiEventInput = {
  title?: string;
  category?: string;
  description?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  location?: string;
};

type ApiEventListResponse = {
  count: number;
  results: ApiEvent[];
};

const EVENT_LIST_PATH = '/api/events/';

const mapEvent = (payload: ApiEvent): Event => ({
  id: payload.id,
  title: payload.title,
  category: payload.category,
  description: payload.description,
  startAt: payload.start_at,
  endAt: payload.end_at,
  location: payload.location,
  owner: payload.owner,
  createdAt: payload.created_at,
  updatedAt: payload.updated_at,
});

const serializeEventInput = (input: EventInput): ApiEventInput => {
  const payload: ApiEventInput = {};

  if (input.title !== undefined) {
    payload.title = input.title;
  }
  if (input.category !== undefined) {
    payload.category = input.category ?? '';
  }
  if (input.description !== undefined) {
    payload.description = input.description ?? '';
  }
  if (input.startAt !== undefined) {
    payload.start_at = input.startAt ?? null;
  }
  if (input.endAt !== undefined) {
    payload.end_at = input.endAt ?? null;
  }
  if (input.location !== undefined) {
    payload.location = input.location ?? '';
  }

  return payload;
};

export async function getMyEvents(params?: GetMyEventsParams): Promise<{ results: Event[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.search) {
    query.set('search', params.search);
  }
  if (params?.category) {
    query.set('category', params.category);
  }
  if (params?.upcoming !== undefined) {
    query.set('upcoming', String(params.upcoming));
  }
  if (params?.ordering) {
    query.set('ordering', params.ordering);
  }
  if (params?.page) {
    query.set('page', String(params.page));
  }

  const queryString = query.toString();
  const path = queryString.length > 0 ? `${EVENT_LIST_PATH}?${queryString}` : EVENT_LIST_PATH;

  const response = await apiFetch<ApiEventListResponse>(path, { method: 'GET' });
  return {
    count: response.count,
    results: response.results.map(mapEvent),
  };
}


export async function getEventCategories(): Promise<string[]> {
  const response = await apiFetch<{ categories: string[] }>(`${EVENT_LIST_PATH}categories/`, { method: 'GET' });
  return response.categories;
}

export async function getEventById(id: number): Promise<Event> {
  const response = await apiFetch<ApiEvent>(`${EVENT_LIST_PATH}${id}/`, { method: 'GET' });
  return mapEvent(response);
}
export async function createEvent(payload: EventInput): Promise<Event> {
  const body = JSON.stringify(serializeEventInput(payload));
  const response = await apiFetch<ApiEvent>(EVENT_LIST_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  return mapEvent(response);
}

export async function updateEvent(id: number, payload: EventInput): Promise<Event> {
  const body = JSON.stringify(serializeEventInput(payload));
  const response = await apiFetch<ApiEvent>(`${EVENT_LIST_PATH}${id}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  return mapEvent(response);
}

export async function deleteEvent(id: number): Promise<void> {
  await apiFetch<null>(`${EVENT_LIST_PATH}${id}/`, {
    method: 'DELETE',
  });
}
