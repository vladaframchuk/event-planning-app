'use client';

import { type JSX, useEffect, useMemo, useState } from 'react';

import { useEventProgress } from '@/hooks/useEventProgress';

type EventProgressBarProps = {
  eventId: number;
};

type ToastState = {
  id: number;
  message: string;
};

const fallbackCounts = { todo: 0, doing: 0, done: 0 } as const;
const ProgressSkeleton = (): JSX.Element => (
  <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div className="flex animate-pulse flex-col gap-3">
      <div className="h-4 w-36 rounded-full bg-neutral-200 dark:bg-neutral-700" />
      <div className="h-3 w-full rounded-full bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-3 w-5/6 rounded-full bg-neutral-200 dark:bg-neutral-800" />
    </div>
  </section>
);

const EventProgressBar = ({ eventId }: EventProgressBarProps): JSX.Element => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [listsOpen, setListsOpen] = useState(false);

  const { data: progress, isLoading, error } = useEventProgress(eventId);

  useEffect(() => {
    if (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Не удалось получить прогресс события. Попробуйте снова.';
      setToast({ id: Date.now(), message });
      return;
    }
    if (progress) {
      setToast(null);
    }
  }, [error, progress]);

  useEffect(() => {
    if (toast === null || typeof window === 'undefined') {
      return;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const counts = progress?.counts ?? fallbackCounts;

  const percentValue = useMemo(() => {
    if (!progress) {
      return 0;
    }
    const raw = Number.isFinite(progress.percent_done) ? progress.percent_done : 0;
    return Math.min(100, Math.max(0, raw));
  }, [progress]);

  const displayPercent = Math.round(percentValue);

  if (isLoading && !progress) {
    return <ProgressSkeleton />;
  }

  const barTooltip = `${counts.todo} / ${counts.doing} / ${counts.done}`;
  const hasTasks = Boolean(progress && progress.total_tasks > 0);
  const lists = progress?.by_list ?? [];
  const summaryText = progress
    ? hasTasks
      ? `Выполнено ${displayPercent}% (${counts.done} / ${progress.total_tasks})`
      : 'Добавьте задачи, чтобы видеть прогресс.'
    : toast?.message ?? 'Нет данных о прогрессе.';

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {toast ? (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {toast.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
          {summaryText}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={displayPercent}
          title={barTooltip}
          className="relative h-4 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out dark:bg-emerald-600"
            style={{ width: `${percentValue}%` }}
          />
          <span className="sr-only">в очереди / в работе / готово: {barTooltip}</span>
        </div>
        {hasTasks ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>в очереди / в работе / готово: {barTooltip}</span>
            <button
              type="button"
              onClick={() => setListsOpen((current) => !current)}
              className="inline-flex items-center rounded-full border border-neutral-300 px-2 py-0.5 font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {listsOpen ? 'Скрыть списки' : 'Показать списки'}
            </button>
          </div>
        ) : null}
      </div>

      {listsOpen && lists.length > 0 ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {lists.map((item) => (
            <li
              key={item.list_id}
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{item.title}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {item.done}/{item.total}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                  {item.todo} в очереди
                </span>
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  {item.doing} в работе
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {item.done} готово
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default EventProgressBar;



