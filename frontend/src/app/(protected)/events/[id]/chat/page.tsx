'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, type JSX } from 'react';

import ChatPanel from '@/components/ChatPanel';
import EventStateCard from '@/components/EventStateCard';
import { getEventById } from '@/lib/eventsApi';
import { t } from '@/lib/i18n';
import type { Event } from '@/types/event';

import EventTabsLayout from '../EventTabsLayout';

const chatSkeleton = (
  <div className="skeleton h-[var(--chat-h)] w-full rounded-3xl" aria-hidden="true" />
);

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return t('event.chat.info.empty');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return t('event.chat.info.empty');
  }

  return dateTimeFormatter.format(date);
};

const EventChatPage = (): JSX.Element => {
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
        subtitle={t('event.chat.header.subtitle')}
        description={t('event.chat.header.description')}
        isLoading
        skeleton={chatSkeleton}
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

  const infoPanel = (
    <dl className="flex flex-col gap-5 text-sm text-[var(--color-text-secondary)]">
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.chat.info.start')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{formatDateTime(event.startAt)}</dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.chat.info.end')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{formatDateTime(event.endAt)}</dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.chat.info.organizer')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{event.owner.email}</dd>
      </div>
    </dl>
  );

  return (
    <EventTabsLayout
      eventId={event.id}
      isOrganizer={isOrganizer}
      title={event.title}
      subtitle={t('event.chat.header.subtitle')}
      description={t('event.chat.header.description')}
      sidePanel={infoPanel}
      skeleton={chatSkeleton}
    >
      <ChatPanel eventId={event.id} />
    </EventTabsLayout>
  );
};

export default EventChatPage;
