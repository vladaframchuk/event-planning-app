import { extractErrorMessage, getAccessToken, logout, refresh } from './authClient';

type ExportFormat = 'pdf' | 'csv' | 'xls';
type ExportTone = 'success' | 'error';

export type ExportNotificationDetail = {
  message: string;
  tone: ExportTone;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';
const DEFAULT_ERROR_MESSAGE = 'Не удалось выполнить экспорт. Попробуйте позже.';
const SUCCESS_MESSAGE = 'Экспорт успешно выполнен.';
const NOTIFY_EVENT_NAME = 'event-export:notify';

const MIME_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xls: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: 'pdf',
  csv: 'csv',
  xls: 'xlsx',
};

const buildUrl = (eventId: number, format: ExportFormat): string =>
  `${API_BASE_URL}/api/events/${eventId}/export/${format}`;

const dispatchNotification = (detail: ExportNotificationDetail) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<ExportNotificationDetail>(NOTIFY_EVENT_NAME, { detail }));
};

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

const performRequest = (eventId: number, format: ExportFormat, token: string | null): Promise<Response> => {
  const headers = new Headers({
    Accept: MIME_TYPES[format],
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(buildUrl(eventId, format), {
    method: 'GET',
    headers,
  });
};

const triggerFileDownload = (blob: Blob, filename: string): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.URL.revokeObjectURL(objectUrl);
};

const exportEvent = async (eventId: number, format: ExportFormat): Promise<void> => {
  let response = await performRequest(eventId, format, getAccessToken());

  if (response.status === 401) {
    try {
      const refreshed = await refresh();
      response = await performRequest(eventId, format, refreshed);
    } catch (error) {
      logout();
      const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;
      dispatchNotification({ message, tone: 'error' });
      throw error instanceof Error ? error : new Error(DEFAULT_ERROR_MESSAGE);
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      logout();
    }
    const payload = await readErrorPayload(response);
    const message = extractErrorMessage(payload, DEFAULT_ERROR_MESSAGE);
    dispatchNotification({ message, tone: 'error' });
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = `event_${eventId}_plan.${FILE_EXTENSIONS[format]}`;
  triggerFileDownload(blob, filename);
  dispatchNotification({ message: SUCCESS_MESSAGE, tone: 'success' });
};

export const exportEventPdf = async (eventId: number): Promise<void> => {
  await exportEvent(eventId, 'pdf');
};

export const exportEventCsv = async (eventId: number): Promise<void> => {
  await exportEvent(eventId, 'csv');
};

export const exportEventXls = async (eventId: number): Promise<void> => {
  await exportEvent(eventId, 'xls');
};

export { NOTIFY_EVENT_NAME };
