import { apiFetch } from '@/lib/fetcher';

export type CreateInvitePayload = {
  expiresInHours: number;
  maxUses: number;
};

type ApiInviteResponse = {
  token: string;
  invite_url: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
  is_revoked: boolean;
};

type ApiValidateInviteResponse = {
  status: 'ok' | 'expired' | 'revoked' | 'exhausted' | 'not_found';
  event: {
    id: number;
    title: string;
    location: string | null;
    start_at: string | null;
  } | null;
  uses_left: number | null;
  expires_at: string | null;
};

type ApiAcceptInviteResponse = {
  message: 'joined' | 'already_member';
  event_id: number;
};

export type ValidateInviteResponse = {
  status: ApiValidateInviteResponse['status'];
  event: {
    id: number;
    title: string;
    location: string | null;
    startAt: string | null;
  } | null;
  usesLeft: number | null;
  expiresAt: string | null;
};

type CreateInviteResult = {
  invite_url: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
};

export const createInvite = async (eventId: number, payload: CreateInvitePayload): Promise<CreateInviteResult> => {
  const body = JSON.stringify({
    expires_in_hours: payload.expiresInHours,
    max_uses: payload.maxUses,
  });

  const response = await apiFetch<ApiInviteResponse>(`/api/events/${eventId}/invites`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });

  return {
    invite_url: response.invite_url,
    expires_at: response.expires_at,
    max_uses: response.max_uses,
    uses_count: response.uses_count,
  };
};

export const validateInvite = async (token: string): Promise<ValidateInviteResponse> => {
  const response = await apiFetch<ApiValidateInviteResponse>(`/api/invites/validate?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    skipAuth: true,
  });

  return {
    status: response.status,
    event: response.event
      ? {
          id: response.event.id,
          title: response.event.title,
          location: response.event.location,
          startAt: response.event.start_at,
        }
      : null,
    usesLeft: response.uses_left,
    expiresAt: response.expires_at,
  };
};

export const acceptInvite = async (
  token: string,
): Promise<{ message: ApiAcceptInviteResponse['message']; event_id: number }> => {
  const body = JSON.stringify({ token });
  return apiFetch<ApiAcceptInviteResponse>('/api/invites/accept', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};

export const revokeInvite = async (token: string): Promise<void> => {
  const body = JSON.stringify({ token });
  await apiFetch('/api/invites/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
};
