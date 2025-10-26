import { extractErrorMessage, getAccessToken, logout, refresh } from './authClient';

export type ApiFetchInit = RequestInit & {
  skipAuth?: boolean;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const buildUrl = (path: string): string => `${API_BASE_URL}${path}`;

const cloneHeaders = (headers?: HeadersInit): Headers => {
  const result = new Headers(headers ?? {});
  if (!result.has('Accept')) {
    result.set('Accept', 'application/json');
  }
  return result;
};

const parseBody = async (response: Response): Promise<unknown> => {
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

const performFetch = (path: string, init: RequestInit, token: string | null): Promise<Response> => {
  const headers = cloneHeaders(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const requestInit: RequestInit = {
    ...init,
    headers,
  };

  return fetch(buildUrl(path), requestInit);
};

const handleResponse = async <T>(response: Response, path: string): Promise<T> => {
  const body = await parseBody(response);
  if (!response.ok) {
    const message = extractErrorMessage(body, `Ошибка при обращении к ${path}.`);
    throw new Error(message);
  }

  return body as T;
};

export const apiFetch = async <T>(path: string, init: ApiFetchInit = {}): Promise<T> => {
  const { skipAuth = false, ...rest } = init;
  const requestInit: RequestInit = { ...rest };

  const initialToken = skipAuth ? null : getAccessToken();
  const response = await performFetch(path, requestInit, initialToken);

  if (response.status === 401 && !skipAuth) {
    try {
      const newAccess = await refresh();
      const retryResponse = await performFetch(path, requestInit, newAccess);
      return handleResponse<T>(retryResponse, path);
    } catch (error) {
      logout();
      throw error;
    }
  }

  return handleResponse<T>(response, path);
};

