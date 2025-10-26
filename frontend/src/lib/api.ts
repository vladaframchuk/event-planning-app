type ApiOptions = {
  baseUrl?: string;
};

const defaultOptions: Required<ApiOptions> = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || '',
};

/**
 * Унифицированный GET-запрос с обработкой HTTP-ошибок.
 * Пока используется только для моков, но структура готова для реальных вызовов.
 */
export async function apiGet<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { baseUrl } = { ...defaultOptions, ...options };
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error ${response.status}: ${errorBody || response.statusText}`);
  }

  return (await response.json()) as T;
}
