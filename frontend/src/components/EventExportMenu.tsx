'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  NOTIFY_EVENT_NAME,
  type ExportNotificationDetail,
  exportEventCsv,
  exportEventPdf,
  exportEventXls,
} from '@/lib/export';
import { t } from '@/lib/i18n';

type ToastState = {
  id: number;
  message: string;
  tone: 'success' | 'error';
};

type EventExportMenuProps = {
  eventId: number;
};

type ExportFormat = 'pdf' | 'csv' | 'xls';

const PDF_LABEL = 'Экспорт в PDF';
const CSV_LABEL = 'Экспорт в CSV';
const XLS_LABEL = 'Экспорт в XLS';
const ERROR_FALLBACK = 'Не удалось выполнить экспорт.';

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

const PdfIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9z" />
    <polyline points="14 2 14 9 21 9" />
    <text x="9.5" y="17" fontSize="6" fontFamily="Arial, sans-serif" fill="currentColor">
      PDF
    </text>
  </svg>
);

const TableIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
    <path d="M3 9h18M3 15h18M9 5v14M15 5v14" />
  </svg>
);

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const LoadingSpinner = () => (
  <svg
    className="h-4 w-4 animate-spin text-current"
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
  const [isOpen, setIsOpen] = useState(false);
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ExportNotificationDetail>).detail;
      if (!detail) {
        hideToastLater({
          id: Date.now(),
          message: ERROR_FALLBACK,
          tone: 'error',
        });
        return;
      }
      hideToastLater({
        id: Date.now(),
        message: detail.message,
        tone: detail.tone,
      });
    };

    window.addEventListener(NOTIFY_EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(NOTIFY_EVENT_NAME, handler as EventListener);
  }, [hideToastLater]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isAnyLoading = loadingFormat !== null;

  const handleToggle = useCallback(() => {
    if (isAnyLoading) {
      return;
    }
    setIsOpen((current) => !current);
  }, [isAnyLoading]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (isAnyLoading) {
        return;
      }

      const actionMap: Record<ExportFormat, () => Promise<void>> = {
        pdf: () => exportEventPdf(eventId),
        csv: () => exportEventCsv(eventId),
        xls: () => exportEventXls(eventId),
      };

      setLoadingFormat(format);
      setIsOpen(false);

      try {
        await actionMap[format]();
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingFormat(null);
      }
    },
    [eventId, isAnyLoading],
  );

  const menuItems = useMemo(
    () => [
      {
        format: 'pdf' as const,
        label: PDF_LABEL,
        icon: <PdfIcon className="h-4 w-4" />,
      },
      {
        format: 'csv' as const,
        label: CSV_LABEL,
        icon: <TableIcon className="h-4 w-4" />,
      },
      {
        format: 'xls' as const,
        label: XLS_LABEL,
        icon: <TableIcon className="h-4 w-4" />,
      },
    ],
    [],
  );

  const triggerLabel = t('event.header.actions.export');

  return (
    <div
      className="relative inline-flex text-left max-[379px]:flex-1 sm:flex-shrink-0"
      ref={containerRef}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={isAnyLoading}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={[
          'btn btn--dark btn--pill inline-flex min-h-[48px] min-w-[168px] items-center justify-center gap-2 px-4 text-sm font-semibold max-[379px]:min-w-[48px] max-[379px]:flex-1 max-[379px]:px-3',
          isAnyLoading ? 'opacity-80' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <ExportIcon className="h-5 w-5 text-inherit" />
        <span className="max-[379px]:hidden">{triggerLabel}</span>
        <ChevronIcon className="hidden h-4 w-4 text-inherit min-[380px]:inline-block" />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-neutral-200 bg-white shadow-lg">
          <ul className="py-1 text-sm text-neutral-800">
            {menuItems.map(({ format, label, icon }) => (
              <li key={format}>
                <button
                  type="button"
                  onClick={() => handleExport(format)}
                  disabled={isAnyLoading}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400"
                >
                  <span className="flex items-center gap-2">
                    {icon}
                    {label}
                  </span>
                  {loadingFormat === format ? <LoadingSpinner /> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {toast ? (
        <div
          className={`absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded-md px-3 py-2 text-xs font-medium shadow-lg ${
            toast.tone === 'success'
              ? 'bg-[var(--button-success-bg)] text-[var(--button-success-text)]'
              : 'bg-[var(--color-error)] text-[var(--color-text-inverse)]'
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
