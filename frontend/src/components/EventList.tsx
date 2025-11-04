'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type JSX } from 'react';

import { t } from '@/lib/i18n';
import type { Event } from '@/types/event';

type EventListProps = {
  events: Event[];
  isLoading?: boolean;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
  currentUserId?: number | null;
  pendingDeleteId?: number | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dateTimeFormatter.format(date);
};

const formatDateRange = (startAt: string | null, endAt: string | null): string => {
  const start = formatDate(startAt);
  const end = formatDate(endAt);

  if (start && end) {
    return t('events.list.dateRange', { start, end });
  }
  if (start) {
    return start;
  }
  return t('events.list.dateFallback');
};

const SkeletonCard = (): JSX.Element => (
  <article className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-6 shadow-sm">
    <div className="skeleton h-6 w-3/4 rounded-full" />
    <div className="skeleton mt-4 h-4 w-1/2 rounded-full" />
    <div className="mt-6 flex flex-wrap gap-3">
      <div className="skeleton h-8 w-24 rounded-full" />
      <div className="skeleton h-8 w-28 rounded-full" />
    </div>
    <div className="skeleton mt-8 h-10 w-2/3 rounded-full" />
  </article>
);

const EventList = ({
  events,
  isLoading = false,
  onEdit,
  onDelete,
  currentUserId,
  pendingDeleteId,
}: EventListProps): JSX.Element => {
  const router = useRouter();

  const handleOpenEvent = (event: Event) => {
    void router.push(`/events/${event.id}`);
  };

  const skeletons = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, index) => (
        <SkeletonCard key={`event-skeleton-${index}`} />
      )),
    [],
  );

  if (isLoading) {
    return <div className="grid gap-6 md:grid-cols-2">{skeletons}</div>;
  }

  if (!events.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-10 py-16 text-center text-sm text-[var(--color-text-secondary)] shadow-sm">
        {t('events.list.empty')}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {events.map((event) => {
        const isOwner = currentUserId === event.owner.id;
        const isDeletePending = pendingDeleteId === event.id;

        return (
          <article
            key={event.id}
            onClick={() => handleOpenEvent(event)}
            className="group flex h-full cursor-pointer flex-col gap-6 rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-sm transition-all duration-[var(--transition-medium)] ease-[var(--easing-standard)] hover:-translate-y-1 hover:shadow-[var(--shadow-md)] sm:px-8 sm:py-8"
          >
            <header className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {event.title}
                </h3>
                <span className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  #{event.id}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {formatDateRange(event.startAt, event.endAt)}
              </p>
            </header>

            <dl className="space-y-3 text-sm text-[var(--color-text-secondary)]">
              <div className="flex items-start gap-2">
                <dt className="min-w-[88px] text-[var(--color-text-muted)]">{t('events.list.location')}</dt>
                <dd>{event.location?.trim().length ? event.location : t('events.list.locationFallback')}</dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="min-w-[88px] text-[var(--color-text-muted)]">{t('events.list.category')}</dt>
                <dd>{event.category?.trim().length ? event.category : t('events.list.categoryFallback')}</dd>
              </div>
            </dl>

            <footer className="mt-auto flex flex-wrap items-center justify-between gap-3">
              <Link
                href={`/events/${event.id}`}
                onClick={(eventClick) => eventClick.stopPropagation()}
                className="btn btn--ghost btn--pill"
              >
                {t('events.list.open')}
              </Link>

              {isOwner ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn--ghost btn--pill"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onEdit(event);
                    }}
                    disabled={isDeletePending}
                  >
                    {t('events.list.actions.edit')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--pill"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onDelete(event);
                    }}
                    disabled={isDeletePending}
                  >
                    {isDeletePending ? t('events.list.actions.deletePending') : t('events.list.actions.delete')}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {t('events.list.actions.viewOnly')}
                </span>
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
};

export default EventList;
