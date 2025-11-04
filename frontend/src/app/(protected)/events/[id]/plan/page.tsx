'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, type JSX } from 'react';

import EventStateCard from '@/components/EventStateCard';
import TaskBoard from '@/components/TaskBoard';
import { getEventById } from '@/lib/eventsApi';
import { t } from '@/lib/i18n';
import type { Event } from '@/types/event';

import EventTabsLayout from '../EventTabsLayout';

const boardSkeleton = (
  <div className="flex flex-col gap-6">
    <div className="skeleton h-4 w-40 rounded-full" />
    <div className="skeleton h-[var(--board-height)] w-full rounded-3xl" />
  </div>
);

const EventPlanPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();

  const eventId = useMemo(() => {
    const rawId = params?.id ?? '';
    const parsed = Number.parseInt(rawId, 10);
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
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EventStateCard
          tone="error"
          title={t('event.state.invalid.title')}
          description={t('event.state.invalid.description')}
          actions={
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent-primary)] px-6 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-accent-primary-strong)]"
            >
              {t('event.state.backToEvents')}
            </Link>
          }
        />
      </div>
    );
  }

  if (eventQuery.isLoading) {
    return (
    <EventTabsLayout
      eventId={eventId}
      isOrganizer
      title={t('event.tabs.loadingTitle')}
      isLoading
      skeleton={boardSkeleton}
    />
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EventStateCard
          tone="error"
          title={t('event.state.error.title')}
          description={eventQuery.error?.message ?? t('event.state.error.description')}
          actions={
            <>
              <button
                type="button"
                onClick={() => eventQuery.refetch()}
                className="inline-flex items-center justify-center rounded-full border border-[var(--color-accent-primary)] px-6 py-2 text-sm font-semibold text-[var(--color-accent-primary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:border-[var(--color-accent-primary-strong)] hover:text-[var(--color-accent-primary-strong)]"
              >
                {t('event.state.retry')}
              </button>
              <Link
                href="/events"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent-primary)] px-6 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-accent-primary-strong)]"
              >
                {t('event.state.backToEvents')}
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const event = eventQuery.data;
  const isOrganizer = event.viewerRole === 'organizer';
  const description =
    event.description && event.description.trim().length > 0
      ? event.description
      : t('event.overview.details.descriptionFallback');

  return (
    <EventTabsLayout
      eventId={event.id}
      isOrganizer={isOrganizer}
      title={event.title}
      description={description}
      skeleton={boardSkeleton}
    >
      <TaskBoard eventId={event.id} />
    </EventTabsLayout>
  );
};

export default EventPlanPage;
