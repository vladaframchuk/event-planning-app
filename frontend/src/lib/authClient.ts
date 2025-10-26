const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const ACCESS_TOKEN_KEY = 'epa_access';
const REFRESH_TOKEN_KEY = 'epa_refresh';
const DEFAULT_ERROR_MESSAGE = 'Не удалось выполнить запрос. Повторите попытку позже.';

const isBrowser = typeof window !== 'undefined';

const buildUrl = (path: string): string => `${API_BASE_URL}${path}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const normalizeMessage = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (isStringArray(value)) {
    const joined = value.map((item) => item.trim()).filter(Boolean).join(' ');
    return joined.length > 0 ? joined : null;
  }

  return null;
};

export const extractErrorMessage = (payload: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string => {
  if (payload == null) {
    return fallback;
  }

  const directMessage = normalizeMessage(payload);
  if (directMessage) {
    return directMessage;
  }

  if (typeof payload === 'object') {
    const data = payload as Record<string, unknown>;

    const prioritizedKeys: Array<keyof typeof data> = ['detail', 'message', 'non_field_errors'];
    for (const key of prioritizedKeys) {
      if (key in data) {
        const candidate = normalizeMessage(data[key]);
        if (candidate) {
          return candidate;
        }
      }
    }

    for (const value of Object.values(data)) {
      const candidate = normalizeMessage(value);
      if (candidate) {
        return candidate;
      }
    }
  }

  return fallback;
};

const persistToken = (key: string, token: string): void => {
  if (isBrowser) {
    window.localStorage.setItem(key, token);
  }
};

const readToken = (key: string): string | null => {
  if (!isBrowser) {
    return null;
  }

  return window.localStorage.getItem(key);
};

const removeToken = (key: string): void => {
  if (isBrowser) {
    window.localStorage.removeItem(key);
  }
};

type LoginSuccessResponse = {
  access: string;
  refresh: string;
};

const isLoginSuccessResponse = (value: unknown): value is LoginSuccessResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return typeof data.access === 'string' && typeof data.refresh === 'string';
};

type RefreshSuccessResponse = {
  access: string;
};

const isRefreshSuccessResponse = (value: unknown): value is RefreshSuccessResponse =>
  typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).access === 'string';

const readJson = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('Content-Type') ?? '';
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  return text;
};

export const login = async (email: string, password: string): Promise<void> => {
  const response = await fetch(buildUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await readJson(response);
  if (!response.ok || !isLoginSuccessResponse(body)) {
    const message = extractErrorMessage(body, 'Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз.');
    throw new Error(message);
  }

  persistToken(ACCESS_TOKEN_KEY, body.access);
  persistToken(REFRESH_TOKEN_KEY, body.refresh);
};

export const refresh = async (): Promise<string> => {
  const refreshToken = readToken(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    throw new Error('Отсутствует refresh-токен. Войдите в систему снова.');
  }

  const response = await fetch(buildUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  const body = await readJson(response);
  if (!response.ok || !isRefreshSuccessResponse(body)) {
    logout();
    const message = extractErrorMessage(body, 'Не удалось обновить сессию. Войдите в систему снова.');
    throw new Error(message);
  }

  persistToken(ACCESS_TOKEN_KEY, body.access);
  return body.access;
};

export const logout = (): void => {
  removeToken(ACCESS_TOKEN_KEY);
  removeToken(REFRESH_TOKEN_KEY);
};

export const getAccessToken = (): string | null => readToken(ACCESS_TOKEN_KEY);

const getRefreshToken = (): string | null => readToken(REFRESH_TOKEN_KEY);

export const isAuthenticated = (): boolean => getAccessToken() !== null && getRefreshToken() !== null;

