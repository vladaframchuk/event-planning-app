import { apiFetch } from '@/lib/fetcher';
import type { ChatMessage } from '@/types/chat';

type ApiChatMessage = {
  id: number;
  event: number;
  author: number;
  author_name: string;
  author_avatar: string | null;
  is_me: boolean;
  text: string;
  created_at: string;
  edited_at: string | null;
};

type ApiChatListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ApiChatMessage[];
};

const mapMessage = (payload: ApiChatMessage): ChatMessage => ({
  id: payload.id,
  event: payload.event,
  author: payload.author,
  authorName: payload.author_name,
  authorAvatar: payload.author_avatar,
  isMe: payload.is_me,
  text: payload.text,
  createdAt: payload.created_at,
  editedAt: payload.edited_at ?? undefined,
});

export async function listMessages(
  eventId: number,
  params?: { page?: number; beforeId?: number; afterId?: number; pageSize?: number },
): Promise<{ count: number; next: string | null; previous: string | null; results: ChatMessage[] }> {
  const query = new URLSearchParams();
  if (params?.page) {
    query.set('page', String(params.page));
  }
  if (params?.beforeId) {
    query.set('before_id', String(params.beforeId));
  }
  if (params?.afterId) {
    query.set('after_id', String(params.afterId));
  }
  if (params?.pageSize) {
    query.set('page_size', String(params.pageSize));
  }

  const queryString = query.toString();
  const path =
    queryString.length > 0
      ? `/api/events/${eventId}/messages?${queryString}`
      : `/api/events/${eventId}/messages`;

  const response = await apiFetch<ApiChatListResponse>(path, { method: 'GET' });

  return {
    count: response.count,
    next: response.next,
    previous: response.previous,
    results: response.results.map(mapMessage),
  };
}

export async function sendMessage(eventId: number, text: string): Promise<ChatMessage> {
  const response = await apiFetch<ApiChatMessage>(`/api/events/${eventId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  return mapMessage(response);
}

