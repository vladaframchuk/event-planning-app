import { extractErrorMessage, getAccessToken, logout, refresh } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const DEFAULT_ERROR_MESSAGE = 'Не удалось экспортировать план события.';

const buildUrl = (eventId: number): string => `${API_BASE_URL}/api/events/${eventId}/export/pdf`;

const readErrorPayload = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
};

const performRequest = (eventId: number, token: string | null): Promise<Response> => {
  const headers = new Headers({
    Accept: 'application/pdf',
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(buildUrl(eventId), {
    method: 'GET',
    headers,
  });
};

export const downloadEventPlanPdf = async (eventId: number): Promise<Blob> => {
  let response = await performRequest(eventId, getAccessToken());

  if (response.status === 401) {
    try {
      const refreshed = await refresh();
      response = await performRequest(eventId, refreshed);
    } catch (error) {
      logout();
      throw error instanceof Error ? error : new Error(DEFAULT_ERROR_MESSAGE);
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      logout();
    }
    const payload = await readErrorPayload(response);
    const message = extractErrorMessage(payload, DEFAULT_ERROR_MESSAGE);
    throw new Error(message);
  }

  return response.blob();
};
