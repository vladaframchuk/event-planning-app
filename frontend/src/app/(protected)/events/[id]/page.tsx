'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type JSX } from 'react';

import EventStateCard from '@/components/EventStateCard';
import TaskBoard from '@/components/TaskBoard';
import { getEventById } from '@/lib/eventsApi';
import { t } from '@/lib/i18n';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';

import EventTabsLayout from './EventTabsLayout';

const INVITE_SUCCESS_TOAST_KEY = 'epa_invite_join_success';

const eventDetailsDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'short',
});

const overviewSkeleton = (
  <div className="flex flex-col gap-6">
    <div className="skeleton h-5 w-40 rounded-full" />
    <div className="skeleton h-4 w-56 rounded-full" />
    <div className="skeleton h-[var(--board-height)] w-full rounded-3xl" />
  </div>
);

const formatDateTime = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return eventDetailsDateTimeFormatter.format(date);
};

const EventDetailsPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const [toastVisible, setToastVisible] = useState(false);

  const eventId = useMemo(() => {
    const raw = params?.id ?? '';
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [params]);

  const eventQuery = useQuery<Event, Error>({
    queryKey: ['event', eventId],
    queryFn: () => getEventById(eventId as number),
    enabled: eventId !== null,
  });

  const profileQuery = useQuery<Profile, Error>({
    queryKey: ['profile', 'me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const isOrganizer = Boolean(
    eventQuery.data?.viewerRole === 'organizer' ||
      (eventQuery.data && profileQuery.data && eventQuery.data.owner.id === profileQuery.data.id),
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const pendingToast = window.sessionStorage.getItem(INVITE_SUCCESS_TOAST_KEY);
    if (!pendingToast) {
      return;
    }
    window.sessionStorage.removeItem(INVITE_SUCCESS_TOAST_KEY);
    setToastVisible(true);
    const timeout = window.setTimeout(() => setToastVisible(false), 3000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!toastVisible || typeof window === 'undefined') {
      return;
    }
    const timeout = window.setTimeout(() => setToastVisible(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastVisible]);

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
        description={t('event.overview.header.description')}
        isLoading
        skeleton={overviewSkeleton}
      />
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EventStateCard
          tone="error"
          title={t('event.overview.errorTitle')}
          description={eventQuery.error?.message ?? t('event.overview.errorDescription')}
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
  const startAt = formatDateTime(event.startAt);
  const endAt = formatDateTime(event.endAt);
  const description =
    event.description && event.description.trim().length > 0
      ? event.description
      : t('event.overview.details.descriptionFallback');

  const sidePanel = (
    <dl className="flex flex-col gap-5 text-sm text-[var(--color-text-secondary)]">
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.info.owner')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{event.owner.email}</dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.info.start')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">
          {startAt ?? t('event.overview.details.dateFallback')}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.info.end')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">
          {endAt ?? t('event.overview.details.dateFallback')}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.info.location')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">
          {event.location?.trim().length ? event.location : t('event.overview.details.locationFallback')}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.info.category')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">
          {event.category?.trim().length ? event.category : t('event.overview.details.categoryFallback')}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.overview.details.descriptionTitle')}
        </dt>
        <dd className="whitespace-pre-wrap text-base font-medium text-[var(--color-text-secondary)]">{description}</dd>
      </div>
    </dl>
  );

  return (
    <>
      {toastVisible ? (
        <div
          className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 items-center rounded-full bg-[var(--color-success)] px-6 py-3 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--shadow-md)]"
          role="status"
        >
          {t('event.overview.toast.invite')}
        </div>
      ) : null}

    <EventTabsLayout
        eventId={event.id}
        isOrganizer={isOrganizer}
        title={event.title}
        description={description}
        sidePanel={sidePanel}
        skeleton={overviewSkeleton}
      >
        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-2">
            <h2 className="text-[clamp(1.5rem,2.4vw,1.875rem)] font-semibold text-[var(--color-text-primary)]">
              {t('event.overview.sections.myTasks.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('event.overview.sections.myTasks.description')}
            </p>
          </header>
          <TaskBoard eventId={event.id} />
        </section>
      </EventTabsLayout>
    </>
  );
};

export default EventDetailsPage;
