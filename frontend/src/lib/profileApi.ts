import { apiFetch } from '@/lib/fetcher';

export type Profile = {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  date_joined: string;
};

export type UpdateProfilePayload = {
  name?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

export type ChangePasswordPayload = {
  old_password: string;
  new_password: string;
};

export type RequestEmailChangePayload = {
  new_email: string;
};

export async function getMe(): Promise<Profile> {
  return apiFetch<Profile>('/api/me', { method: 'GET' });
}

export async function updateMe(data: UpdateProfilePayload): Promise<Profile> {
  return apiFetch<Profile>('/api/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiFetch<null>('/api/me/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function requestEmailChange(payload: RequestEmailChangePayload): Promise<void> {
  await apiFetch<null>('/api/me/change-email/request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData();
  form.append('avatar', file);

  return apiFetch<{ avatar_url: string }>('/api/me/avatar', {
    method: 'POST',
    body: form,
  });
}
