'use client';

import { useParams } from 'next/navigation';
import { type JSX, useMemo } from 'react';

import EventProgressBar from '@/components/EventProgressBar';
import TaskBoard from '@/components/TaskBoard';

const EventPlanPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();

  const eventId = useMemo(() => {
    const rawId = params?.id ?? '';
    const parsed = Number.parseInt(rawId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [params]);

  if (eventId === null) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Некорректный идентификатор события</h1>
        <p className="mt-2 text-sm">Проверьте адрес страницы и попробуйте снова.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">План задач</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Здесь отображаются колонки и задачи выбранного события.
        </p>
      </header>
      <EventProgressBar eventId={eventId} />
      <TaskBoard eventId={eventId} />
    </section>
  );
};

export default EventPlanPage;
