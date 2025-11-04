'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type JSX, useEffect, useMemo, useState } from 'react';

import EventFormDialog, { type EventFormSubmitPayload } from '@/components/EventFormDialog';
import EventList from '@/components/EventList';
import EventStateCard from '@/components/EventStateCard';
import { createEvent, deleteEvent, getEventCategories, getMyEvents, updateEvent } from '@/lib/eventsApi';
import { t, type TranslationKey } from '@/lib/i18n';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';

const PAGE_SIZE = 10;

type OrderingOption = 'start_at' | '-start_at';
type TimeFilter = 'all' | 'upcoming' | 'past';

const TIME_FILTER_OPTIONS: ReadonlyArray<{ value: TimeFilter; labelKey: TranslationKey }> = [
  { value: 'all', labelKey: 'events.filters.time.all' },
  { value: 'upcoming', labelKey: 'events.filters.time.upcoming' },
  { value: 'past', labelKey: 'events.filters.time.past' },
] as const;

const ORDERING_OPTIONS: ReadonlyArray<{ value: OrderingOption; labelKey: TranslationKey }> = [
  { value: 'start_at', labelKey: 'events.filters.ordering.startAsc' },
  { value: '-start_at', labelKey: 'events.filters.ordering.startDesc' },
] as const;

const EventsPage = (): JSX.Element => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [ordering, setOrdering] = useState<OrderingOption>('start_at');
  const [page, setPage] = useState(1);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fieldClassName =
    'w-full min-h-[48px] rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';

  const eventsQueryKey = useMemo(
    () => [
      'events',
      {
        search,
        category,
        timeFilter,
        ordering,
        page,
      },
    ],
    [search, category, timeFilter, ordering, page],
  );

  const eventsQuery = useQuery<{ results: Event[]; count: number }, Error>({
    queryKey: eventsQueryKey,
    queryFn: () =>
      getMyEvents({
        search: search.trim() || undefined,
        category: category.trim() || undefined,
        upcoming: timeFilter === 'upcoming' ? true : timeFilter === 'past' ? false : undefined,
        ordering,
        page,
      }),
    placeholderData: (previousData) => previousData,
  });

  const profileQuery = useQuery<Profile, Error>({
    queryKey: ['profile', 'me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const categoriesQuery = useQuery<string[], Error>({
    queryKey: ['events', 'categories'],
    queryFn: getEventCategories,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation<Event, Error, EventFormSubmitPayload>({
    mutationFn: (payload: EventFormSubmitPayload) => createEvent(payload),
  });

  const updateMutation = useMutation<Event, Error, { id: number; payload: EventFormSubmitPayload }>({
    mutationFn: ({ id, payload }: { id: number; payload: EventFormSubmitPayload }) => updateEvent(id, payload),
  });

  const deleteMutation = useMutation<void, Error, number>({
    mutationFn: (id: number) => deleteEvent(id),
  });

  const totalCount = eventsQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const events = eventsQuery.data?.results ?? [];

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleOpenCreate = () => {
    setEditingEvent(null);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setDialogError(null);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    if (!createMutation.isPending && !updateMutation.isPending) {
      setDialogOpen(false);
      setEditingEvent(null);
      setDialogError(null);
    }
  };

  const invalidateEvents = async () => {
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  };

  const handleDialogSubmit = async (values: EventFormSubmitPayload) => {
    setDialogError(null);
    try {
      if (editingEvent) {
        await updateMutation.mutateAsync({ id: editingEvent.id, payload: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      await invalidateEvents();
      setDialogOpen(false);
      setEditingEvent(null);
      setDialogError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('events.dialog.error.generic');
      setDialogError(message);
      throw error;
    }
  };

  const handleDelete = async (event: Event) => {
    const confirmed = window.confirm(t('events.delete.confirm', { title: event.title }));
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(event.id);
      await invalidateEvents();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('events.delete.error');
      // eslint-disable-next-line no-alert
      alert(message);
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(1);
  };

  const handleCategoryChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCategory(event.target.value);
    setPage(1);
  };

  const handleTimeFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTimeFilter(event.target.value as TimeFilter);
    setPage(1);
  };

  const handleOrderingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrderingOption;
    setOrdering(value);
    setPage(1);
  };

  const handlePrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  };

  const currentUserId = profileQuery.data?.id ?? null;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const pendingDeleteId = deleteMutation.isPending ? deleteMutation.variables ?? null : null;

  const hasQueryError = eventsQuery.isError || profileQuery.isError;
  const hasActiveFilters =
    search.trim().length > 0 || category.trim().length > 0 || timeFilter !== 'all' || ordering !== 'start_at';
  const filtersPanelId = 'events-filters-panel';
  const eventsSubtitle = t('events.header.subtitle').trim();

  const sectionStyle = {
    paddingBottom: 'calc(var(--safe-bottom) + var(--space-xl))',
    touchAction: 'pan-y',
  } as const;

  return (
    <section className="w-full px-4 pt-10 sm:px-8 lg:px-16 xl:px-24" style={sectionStyle}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-8 shadow-[var(--shadow-md)] sm:px-12 sm:py-12">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex max-w-3xl flex-col gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                {t('events.header.kicker')}
              </p>
              <h1 className="text-[clamp(2rem,3vw,2.8rem)] font-semibold leading-[1.08] text-[var(--color-text-primary)]">
                {t('events.header.title')}
              </h1>
              {eventsSubtitle.length > 0 ? (
                <p className="text-base text-[var(--color-text-secondary)]">{eventsSubtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="btn btn--primary btn--pill self-start sm:self-auto"
              aria-label={t('events.actions.create')}
            >
              {t('events.actions.create')}
            </button>
          </div>
        </header>

        <div
          className="rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-[var(--shadow-sm)] sm:px-10 sm:py-8"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen((prev) => !prev)}
                aria-expanded={filtersOpen}
                aria-controls={filtersPanelId}
                className={[
                  'inline-flex min-h-[48px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                  filtersOpen
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-background-primary)] text-[var(--color-accent-primary)]'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary)]',
                ].join(' ')}
                title={filtersOpen ? t('events.filters.toggle.hide') : t('events.filters.toggle.show')}
              >
                {filtersOpen ? t('events.filters.toggle.hide') : t('events.filters.toggle.show')}
                {hasActiveFilters ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-2 w-2 rounded-full bg-[var(--color-accent-primary)]"
                  />
                ) : null}
              </button>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]" aria-live="polite" aria-atomic="true">
                {t('events.filters.results', { count: totalCount })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn--ghost btn--pill"
                onClick={handlePrevPage}
                disabled={page === 1}
                aria-label={t('events.pagination.prev')}
              >
                {t('events.pagination.prev')}
              </button>
              <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
                {t('events.pagination.page', { page, total: totalPages })}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--pill"
                onClick={handleNextPage}
                disabled={page >= totalPages}
                aria-label={t('events.pagination.next')}
              >
                {t('events.pagination.next')}
              </button>
            </div>
          </div>

          {filtersOpen ? (
            <div id={filtersPanelId} className="mt-6 grid gap-6">
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('events.filters.search')}
                  <input
                    type="search"
                    value={search}
                    onChange={handleSearchChange}
                    placeholder={t('events.filters.searchPlaceholder')}
                    className={fieldClassName}
                    inputMode="search"
                    enterKeyHint="search"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('events.filters.ordering.title')}
                  <select value={ordering} onChange={handleOrderingChange} className={fieldClassName}>
                    {ORDERING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('events.filters.category')}
                  <select
                    value={category}
                    onChange={handleCategoryChange}
                    className={fieldClassName}
                    disabled={categoriesQuery.isLoading}
                  >
                    <option value="">{t('events.filters.categoryAll')}</option>
                    {(categoriesQuery.data ?? []).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('events.filters.time.title')}
                  <select value={timeFilter} onChange={handleTimeFilterChange} className={fieldClassName}>
                    {TIME_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </div>

        {hasQueryError ? (
          <EventStateCard
            tone="error"
            title={t('events.errors.loadTitle')}
            description={eventsQuery.error?.message ?? profileQuery.error?.message ?? t('events.errors.loadDescription')}
            actions={
              <button type="button" className="btn btn--ghost btn--pill" onClick={() => eventsQuery.refetch()}>
                {t('events.actions.retry')}
              </button>
            }
          />
        ) : (
          <EventList
            events={events}
            isLoading={eventsQuery.isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            currentUserId={currentUserId}
            pendingDeleteId={pendingDeleteId ?? undefined}
          />
        )}
      </div>

      <EventFormDialog
        open={isDialogOpen}
        onClose={handleDialogClose}
        onSubmit={handleDialogSubmit}
        initialEvent={editingEvent ?? undefined}
        loading={isSubmitting}
        errorMessage={dialogError}
      />
    </section>
  );
};

export default EventsPage;
