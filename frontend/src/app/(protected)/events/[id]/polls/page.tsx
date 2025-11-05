'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type JSX } from 'react';

import EventStateCard from '@/components/EventStateCard';
import PollCard from '@/components/PollCard';
import PollCreateDialog from '@/components/PollCreateDialog';
import { usePollsRealtime } from '@/hooks/usePollsRealtime';
import { getEventById } from '@/lib/eventsApi';
import { t, type TranslationKey } from '@/lib/i18n';
import { closePoll, deletePoll, listPolls, vote } from '@/lib/pollsApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';
import type { Poll } from '@/types/poll';

import EventTabsLayout from '../EventTabsLayout';

type FilterValue = 'all' | 'open' | 'closed';
type ToastState = { id: number; message: string; tone: 'success' | 'error' } | null;
type PollListResponse = { results: Poll[]; count: number };

const PAGE_SIZE = 5;

const FILTERS: ReadonlyArray<{ value: FilterValue; labelKey: TranslationKey }> = [
  { value: 'all', labelKey: 'event.polls.filters.all' },
  { value: 'open', labelKey: 'event.polls.filters.open' },
  { value: 'closed', labelKey: 'event.polls.filters.closed' },
] as const;

const pollsSkeleton = (
  <div className="flex flex-col gap-5">
    <div className="skeleton h-16 w-full rounded-3xl" />
    <div className="skeleton h-24 w-full rounded-3xl" />
    <div className="skeleton h-24 w-full rounded-3xl" />
  </div>
);

const PollsPage = (): JSX.Element => {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const eventId = useMemo(() => {
    const raw = params?.id ?? '';
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }, [params]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const eventQuery = useQuery<Event, Error>({
    queryKey: ['event', eventId],
    queryFn: () => getEventById(eventId as number),
    enabled: eventId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const profileQuery = useQuery<Profile, Error>({
    queryKey: ['profile', 'me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const pollsQuery = useQuery<PollListResponse, Error>({
    queryKey: ['polls', eventId, filter, page],
    queryFn: () =>
      listPolls(eventId as number, {
        isClosed: filter === 'all' ? undefined : filter === 'closed',
        page,
      }),
    enabled: eventId !== null,
  });

  const voteMutation = useMutation<Poll, Error, { pollId: number; optionIds: number[] }>({
    mutationFn: ({ pollId, optionIds }) => vote(pollId, optionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: t('event.polls.toast.voteSuccess'), tone: 'success' });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : t('event.polls.toast.voteError');
      setToast({ id: Date.now(), message, tone: 'error' });
    },
  });

  const closeMutation = useMutation<void, Error, { pollId: number }>({
    mutationFn: ({ pollId }) => closePoll(pollId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: t('event.polls.toast.closeSuccess'), tone: 'success' });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : t('event.polls.toast.closeError');
      setToast({ id: Date.now(), message, tone: 'error' });
    },
  });

  const deleteMutation = useMutation<void, Error, { pollId: number }>({
    mutationFn: ({ pollId }) => deletePoll(pollId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: t('event.polls.toast.deleteSuccess'), tone: 'success' });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : t('event.polls.toast.deleteError');
      setToast({ id: Date.now(), message, tone: 'error' });
    },
  });

  usePollsRealtime({ eventId, pageSize: PAGE_SIZE });

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
        skeleton={pollsSkeleton}
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
  const viewerId = profileQuery.data?.id ?? null;
  const isOrganizer =
    event.viewerRole === 'organizer' ||
    (event.owner.id != null && viewerId != null && event.owner.id === viewerId);
  const description =
    event.description && event.description.trim().length > 0
      ? event.description
      : t('event.overview.details.descriptionFallback');

  const polls: Poll[] = pollsQuery.data?.results ?? [];
  const pollCount = pollsQuery.data?.count ?? 0;
  const totalPages = pollCount > 0 ? Math.ceil(pollCount / PAGE_SIZE) : 1;

  const createPollButton = isOrganizer ? (
    <button
      type="button"
      onClick={() => setDialogOpen(true)}
      className="btn btn--primary btn--pill"
    >
      {t('event.polls.actions.create')}
    </button>
  ) : null;

  const sidePanel = (
    <dl className="flex flex-col gap-5 text-sm text-[var(--color-text-secondary)]">
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.polls.info.total')}
        </dt>
        <dd className="text-base font-semibold text-[var(--color-text-primary)]">{pollCount}</dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.polls.info.currentPage')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">
          {page} / {totalPages}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.polls.info.organizer')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{event.owner.email}</dd>
      </div>
    </dl>
  );

  const filterControls = (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-muted)] px-5 py-4 text-sm shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <span className="text-[var(--color-text-secondary)] font-medium">{t('event.polls.filters.label')}</span>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={[
                  'rounded-full px-4 py-1.5 font-semibold transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                  active
                    ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] shadow-[var(--shadow-sm)]'
                    : 'bg-[var(--color-background-elevated)] text-[var(--color-text-secondary)] hover:bg-[var(--color-background-primary)]',
                ].join(' ')}
                aria-pressed={active}
              >
                {t(item.labelKey)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-subtle)] text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] disabled:opacity-40 hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]"
          aria-label={t('event.polls.pagination.prev')}
        >
          ‹
        </button>
        <span className="min-w-[72px] text-center text-sm font-semibold text-[var(--color-text-primary)]">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page >= totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-subtle)] text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] disabled:opacity-40 hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]"
          aria-label={t('event.polls.pagination.next')}
        >
          ›
        </button>
      </div>
    </div>
  );

  const pollsSectionBody = pollsQuery.isLoading
    ? pollsSkeleton
    : pollsQuery.isError
      ? (
        <div className="rounded-3xl border border-[var(--color-error-soft)] bg-[var(--color-error-soft)]/45 px-6 py-8 text-sm text-[var(--color-error)] shadow-sm">
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t('event.polls.list.errorTitle')}
          </h3>
          <p className="mt-2 text-sm">
            {pollsQuery.error?.message ?? t('event.polls.list.errorDescription')}
          </p>
          <button
            type="button"
            onClick={() => pollsQuery.refetch()}
            className="mt-4 btn btn--ghost btn--pill"
          >
            {t('event.state.retry')}
          </button>
        </div>
      )
      : polls.length === 0
        ? (
          <div className="rounded-3xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-12 text-center text-sm text-[var(--color-text-secondary)] shadow-sm">
            {isOrganizer ? t('event.polls.list.emptyOrganizer') : t('event.polls.list.emptyMember')}
          </div>
        )
        : (
          <div className="flex flex-col gap-5">
            {polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                canManage={isOrganizer}
                votePending={voteMutation.isPending && voteMutation.variables?.pollId === poll.id}
                closePending={closeMutation.isPending && closeMutation.variables?.pollId === poll.id}
                deletePending={deleteMutation.isPending && deleteMutation.variables?.pollId === poll.id}
                onVote={(optionIds) => voteMutation.mutate({ pollId: poll.id, optionIds })}
                onClose={() => closeMutation.mutate({ pollId: poll.id })}
                onDelete={() => deleteMutation.mutate({ pollId: poll.id })}
              />
            ))}
          </div>
        );

  const listContent = (
    <section className="rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('event.polls.list.title')}
        </h2>
        {createPollButton}
      </div>
      <div className="mt-4">
        {pollsSectionBody}
      </div>
    </section>
  );

  return (
    <>
    <EventTabsLayout
        eventId={event.id}
        isOrganizer={isOrganizer}
        title={event.title}
        description={description}
        sidePanel={sidePanel}
        skeleton={pollsSkeleton}
      >
        {filterControls}
        {listContent}
        <div className="flex items-center justify-end gap-2 text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          <span>
            {t('event.polls.pagination.caption', { page, total: totalPages })}
          </span>
        </div>
      </EventTabsLayout>

      {isOrganizer ? (
        <PollCreateDialog
          open={isDialogOpen}
          eventId={event.id}
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['polls', event.id], exact: false });
            setDialogOpen(false);
            setToast({ id: Date.now(), message: t('event.polls.toast.createSuccess'), tone: 'success' });
          }}
        />
      ) : null}

      {toast ? (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 rounded-full px-5 py-3 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--shadow-md)]',
            toast.tone === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]',
          ].join(' ')}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
};

export default PollsPage;
