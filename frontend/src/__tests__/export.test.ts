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
import {
  NOTIFY_EVENT_NAME,
  exportEventCsv,
  exportEventPdf,
  exportEventXls,
  type ExportNotificationDetail,
} from '@/lib/export';

const mockedFetch = vi.fn(fetch);

const setupDomSpies = () => {
  const anchor = document.createElement('a');
  const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
  const originalCreateElement = document.createElement;
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName.toLowerCase() === 'a') {
      return anchor;
    }
    return originalCreateElement.call(document, tagName);
  });
  const appendSpy = vi.spyOn(document.body, 'appendChild');
  const removeSpy = vi.spyOn(document.body, 'removeChild');
  if (typeof window.URL.createObjectURL !== 'function') {
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: () => 'blob:stub',
    });
  }
  const createObjectURLSpy = vi
    .spyOn(window.URL, 'createObjectURL')
    .mockReturnValue('blob:export-url');
  if (typeof window.URL.revokeObjectURL !== 'function') {
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }
  const revokeObjectURLSpy = vi.spyOn(window.URL, 'revokeObjectURL');

  return {
    anchor,
    clickSpy,
    createElementSpy,
    appendSpy,
    removeSpy,
    createObjectURLSpy,
    revokeObjectURLSpy,
  };
};

afterEach(() => {
  mockedFetch.mockReset();
  vi.restoreAllMocks();
});

describe('exportEventPdf', () => {
  it('downloads PDF, sets headers and dispatches success notification', async () => {
    const notifications: ExportNotificationDetail[] = [];
    const notificationHandler = (event: Event) =>
      notifications.push((event as CustomEvent<ExportNotificationDetail>).detail);
    window.addEventListener(NOTIFY_EVENT_NAME, notificationHandler as EventListener);

    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);
    vi.mocked(getAccessToken).mockReturnValue('token-123');

    const pdfResponse = new Response('pdf-content', {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
    mockedFetch.mockResolvedValue(pdfResponse);

    const dom = setupDomSpies();

    await exportEventPdf(77);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0] ?? [];
    expect(typeof url).toBe('string');
    expect(url).toContain('/api/events/77/export/pdf');
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('Accept')).toBe('application/pdf');

    expect(dom.createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(dom.clickSpy).toHaveBeenCalledTimes(1);
    expect(dom.appendSpy).toHaveBeenCalledTimes(1);
    expect(dom.removeSpy).toHaveBeenCalledTimes(1);
    expect(dom.revokeObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(dom.anchor.download).toBe('event_77_plan.pdf');

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({
      message: 'Экспорт успешно выполнен.',
      tone: 'success',
    });

    window.removeEventListener(NOTIFY_EVENT_NAME, notificationHandler as EventListener);
  });

  it('refreshes token after 401 and retries the request once', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);
    vi.mocked(getAccessToken).mockReturnValue('expired-token');
    vi.mocked(refresh).mockResolvedValue('new-token');

    const unauthorizedResponse = new Response(JSON.stringify({ detail: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    const successResponse = new Response('pdf-binary', { status: 200 });

    mockedFetch.mockResolvedValueOnce(unauthorizedResponse).mockResolvedValueOnce(successResponse);

    const dom = setupDomSpies();

    await exportEventPdf(11);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const firstCall = mockedFetch.mock.calls[0];
    const secondCall = mockedFetch.mock.calls[1];
    const [, firstInit] = firstCall ?? [];
    const [, secondInit] = secondCall ?? [];
    const firstHeaders =
      firstInit?.headers instanceof Headers ? firstInit.headers : new Headers(firstInit?.headers);
    const secondHeaders =
      secondInit?.headers instanceof Headers ? secondInit.headers : new Headers(secondInit?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer expired-token');
    expect(secondHeaders.get('Authorization')).toBe('Bearer new-token');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dom.clickSpy).toHaveBeenCalledTimes(1);
  });

  it('dispatches error notification and throws with message on failure', async () => {
    const notifications: ExportNotificationDetail[] = [];
    const notificationHandler = (event: Event) =>
      notifications.push((event as CustomEvent<ExportNotificationDetail>).detail);
    window.addEventListener(NOTIFY_EVENT_NAME, notificationHandler as EventListener);

    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);
    vi.mocked(getAccessToken).mockReturnValue('token-xyz');

    const errorPayload = { detail: 'Сервис временно недоступен' };
    const errorResponse = new Response(JSON.stringify(errorPayload), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });

    mockedFetch.mockResolvedValue(errorResponse);

    await expect(exportEventPdf(5)).rejects.toThrow('Сервис временно недоступен');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({
      message: 'Сервис временно недоступен',
      tone: 'error',
    });

    window.removeEventListener(NOTIFY_EVENT_NAME, notificationHandler as EventListener);
  });
});

describe('exportEventCsv', () => {
  it('requests CSV export and downloads a CSV file', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);
    vi.mocked(getAccessToken).mockReturnValue(null);

    const csvResponse = new Response('csv;content', {
      status: 200,
      headers: { 'Content-Type': 'text/csv' },
    });
    mockedFetch.mockResolvedValue(csvResponse);

    const dom = setupDomSpies();

    await exportEventCsv(52);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockedFetch.mock.calls[0] ?? [];
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    expect(headers.get('Accept')).toBe('text/csv');
    expect(dom.anchor.download).toBe('event_52_plan.csv');
  });
});

describe('exportEventXls', () => {
  it('requests XLS export and saves file with .xlsx extension', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockedFetch);
    vi.mocked(getAccessToken).mockReturnValue('token-abc');

    const xlsResponse = new Response('binary', {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
    mockedFetch.mockResolvedValue(xlsResponse);

    const dom = setupDomSpies();

    await exportEventXls(99);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockedFetch.mock.calls[0] ?? [];
    const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers);
    expect(headers.get('Accept')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(dom.anchor.download).toBe('event_99_plan.xlsx');
  });
});
