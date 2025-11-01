import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authClient')>();
  return {
    ...actual,
    getAccessToken: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };
});

import { getAccessToken, logout, refresh } from '@/lib/authClient';
import { downloadEventPlanPdf } from '@/lib/export';

const mockedFetch = vi.fn(fetch);

describe('downloadEventPlanPdf', () => {
  afterEach(() => {
    mockedFetch.mockReset();
    vi.restoreAllMocks();
  });

  it('fetches PDF with current token and returns blob', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-123');
    const pdfResponse = new Response('pdf-content', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
    mockedFetch.mockResolvedValue(pdfResponse);
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);

    const blob = await downloadEventPlanPdf(77);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const call = mockedFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Accept')).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('application/pdf');
  });

  it('refreshes token after 401 and retries the request', async () => {
    vi.mocked(getAccessToken).mockReturnValue('expired-token');
    vi.mocked(refresh).mockResolvedValue('new-token');

    const unauthorizedResponse = new Response(JSON.stringify({ detail: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    const successResponse = new Response('pdf-binary', { status: 200 });

    mockedFetch.mockResolvedValueOnce(unauthorizedResponse).mockResolvedValueOnce(successResponse);
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);

    const blob = await downloadEventPlanPdf(11);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const firstCall = mockedFetch.mock.calls[0];
    const secondCall = mockedFetch.mock.calls[1];
    expect(firstCall).toBeDefined();
    expect(secondCall).toBeDefined();
    const [, firstInit] = firstCall ?? [];
    const [, secondInit] = secondCall ?? [];
    const firstHeaders =
      firstInit?.headers instanceof Headers ? firstInit.headers : new Headers(firstInit?.headers);
    const secondHeaders =
      secondInit?.headers instanceof Headers ? secondInit.headers : new Headers(secondInit?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer expired-token');
    expect(secondHeaders.get('Authorization')).toBe('Bearer new-token');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('throws error and logs out when server returns failure', async () => {
    vi.mocked(getAccessToken).mockReturnValue('token-xyz');
    const errorPayload = { detail: 'Сервис временно недоступен' };
    const errorResponse = new Response(JSON.stringify(errorPayload), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

    mockedFetch.mockResolvedValue(errorResponse);
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);

    await expect(downloadEventPlanPdf(5)).rejects.toThrow('Сервис временно недоступен');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(0);
  });
});
