'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import ChatPanel from '@/components/ChatPanel';
import EventNavigation from '@/components/EventNavigation';
import { getEventById } from '@/lib/eventsApi';
import type { Event } from '@/types/event';

const EventChatPage = () => {
  const params = useParams<{ id: string }>();

  const eventId = useMemo(() => {
    const raw = params?.id ?? '';
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [params]);

  const eventQuery = useQuery<Event, Error>({
    queryKey: ['event', eventId],
    queryFn: () => getEventById(eventId as number),
    enabled: eventId !== null,
    staleTime: 5 * 60 * 1000,
  });

  if (eventId === null) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Не удалось определить событие</h1>
        <p className="mt-2 text-sm">Проверьте ссылку и попробуйте снова.</p>
        <Link
          href="/events"
          className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700 dark:text-blue-400"
        >
          К списку событий
        </Link>
      </section>
    );
  }

  if (eventQuery.isLoading) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        Загружаем чат события...
      </section>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Не удалось загрузить событие</h1>
        <p className="mt-2 text-sm">
          {eventQuery.error?.message ?? 'Попробуйте обновить страницу немного позже.'}
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => eventQuery.refetch()}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Повторить попытку
          </button>
          <Link
            href="/events"
            className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            К списку событий
          </Link>
        </div>
      </section>
    );
  }

  const event = eventQuery.data;

  return (
    <section className="flex w-full flex-col gap-6 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-col gap-1">
          <p className="text-sm uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Общение участников
          </p>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{event.title}</h1>
        </header>
        <ChatPanel eventId={event.id} />
      </div>
      <EventNavigation eventId={event.id} className="lg:mt-0" />
    </section>
  );
};

export default EventChatPage;

