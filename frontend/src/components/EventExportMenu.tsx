'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { downloadEventPlanPdf } from '@/lib/export';

type ToastState = {
  id: number;
  message: string;
  tone: 'success' | 'error';
};

type EventExportMenuProps = {
  eventId: number;
};

const SUCCESS_MESSAGE = 'Экспорт завершён';
const ERROR_MESSAGE = 'Не удалось выгрузить PDF. Попробуйте позже.';

const ExportIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 3v12m0 0 4-4m-4 4-4-4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 15v4.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V15"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-white"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      d="M4 12a8 8 0 0 1 8-8"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);

const EventExportMenu = ({ eventId }: EventExportMenuProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const hideToastLater = useCallback(
    (nextToast: ToastState | null) => {
      setToast(nextToast);
      if (typeof window === 'undefined') {
        return;
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      if (nextToast) {
        timeoutRef.current = window.setTimeout(() => {
          setToast((current) => (current?.id === nextToast.id ? null : current));
        }, 3000);
      }
    },
    [setToast],
  );

  useEffect(
    () => () => {
      if (typeof window !== 'undefined' && timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleClick = useCallback(async () => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    hideToastLater(null);

    try {
      const blob = await downloadEventPlanPdf(eventId);
      const filename = `event_${eventId}_plan.pdf`;

      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;

      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);

      hideToastLater({
        id: Date.now(),
        message: SUCCESS_MESSAGE,
        tone: 'success',
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0 ? error.message : ERROR_MESSAGE;
      hideToastLater({
        id: Date.now(),
        message,
        tone: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [eventId, hideToastLater, isLoading]);

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading}
        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-600 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      >
        <ExportIcon className="h-4 w-4" />
        <span>Экспорт → PDF</span>
        {isLoading ? <LoadingSpinner /> : null}
      </button>

      {toast ? (
        <div
          className={`absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded-md px-3 py-2 text-xs font-medium shadow-lg ${
            toast.tone === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
};

export default EventExportMenu;
