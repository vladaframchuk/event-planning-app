import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/lib/fetcher';
import { changePassword, getMe, requestEmailChange, updateMe, uploadAvatar } from '@/lib/profileApi';

vi.mock('@/lib/fetcher', () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe('profileApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getMe fetches profile data', async () => {
    const profile = {
      id: 1,
      email: 'user@example.com',
      name: 'User',
      avatar_url: 'https://example.com/avatar.png',
      date_joined: '2024-01-01T00:00:00Z',
      email_notifications_enabled: true,
    };

    mockedApiFetch.mockResolvedValueOnce(profile);

    const result = await getMe();

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/me', { method: 'GET' });
    expect(result).toEqual(profile);
  });

  it('updateMe sends JSON payload', async () => {
    const payload = { name: 'Alice' };
    const updatedProfile = {
      id: 1,
      email: 'user@example.com',
      name: 'Alice',
      avatar_url: null,
      date_joined: '2024-01-01T00:00:00Z',
      email_notifications_enabled: false,
    };

    mockedApiFetch.mockResolvedValueOnce(updatedProfile);

    const result = await updateMe(payload);

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(result).toEqual(updatedProfile);
  });

  it('changePassword posts credentials', async () => {
    mockedApiFetch.mockResolvedValueOnce(null);

    await changePassword({ old_password: 'OldPass123', new_password: 'NewPass456' });

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/me/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: 'OldPass123', new_password: 'NewPass456' }),
    });
  });

  it('requestEmailChange posts new email', async () => {
    mockedApiFetch.mockResolvedValueOnce(null);

    await requestEmailChange({ new_email: 'new@example.com' });

    expect(mockedApiFetch).toHaveBeenCalledWith('/api/account/email/change-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_email: 'new@example.com' }),
    });
  });

  it('uploadAvatar sends FormData payload', async () => {
    const originalFormData = globalThis.FormData;
    const appendSpy = vi.fn();

    class MockFormData {
      public append = appendSpy;
    }

    // @ts-expect-error: явно переопределяем реализацию для теста
    globalThis.FormData = MockFormData;

    const response = { avatar_url: 'http://localhost:8000/media/users/1/avatar.png' };
    mockedApiFetch.mockResolvedValueOnce(response);

    try {
      const file = new File(['avatar-bytes'], 'avatar.png', { type: 'image/png' });

      const result = await uploadAvatar(file);

      expect(appendSpy).toHaveBeenCalledWith('avatar', file);
      const [, init] = mockedApiFetch.mock.calls[0];
      expect(init?.body).toBeInstanceOf(MockFormData);
      expect(init).toMatchObject({ method: 'POST' });
      expect(result).toEqual(response);
    } finally {
      globalThis.FormData = originalFormData;
    }
  });
});
