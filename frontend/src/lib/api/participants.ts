import { apiFetch } from '@/lib/fetcher';
import type { Participant, Role } from '@/types/event';

type ApiParticipant = {
  id: number;
  role: Role | string;
  joined_at: string;
  user: {
    id: number;
    email: string;
    name: string | null;
    avatar: string | null;
  };
};

type ApiParticipantListResponse = {
  count: number;
  results: ApiParticipant[];
};

const normalizeRole = (role: Role | string): Role => (role === 'organizer' ? 'organizer' : 'member');

const mapParticipant = (payload: ApiParticipant): Participant => ({
  id: payload.id,
  role: normalizeRole(payload.role),
  joinedAt: payload.joined_at,
  user: {
    id: payload.user.id,
    email: payload.user.email,
    name: payload.user.name ?? null,
    avatar: payload.user.avatar,
  },
});

export const getParticipants = async (eventId: number): Promise<Participant[]> => {
  const response = await apiFetch<ApiParticipantListResponse>(`/api/events/${eventId}/participants`, {
    method: 'GET',
  });
  return response.results.map(mapParticipant);
};

export const updateParticipantRole = async (
  eventId: number,
  participantId: number,
  role: Role,
): Promise<void> => {
  const body = JSON.stringify({ role });
  await apiFetch(`/api/events/${eventId}/participants/${participantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
};

export const removeParticipant = async (eventId: number, participantId: number): Promise<void> => {
  await apiFetch(`/api/events/${eventId}/participants/${participantId}`, {
    method: 'DELETE',
  });
};
