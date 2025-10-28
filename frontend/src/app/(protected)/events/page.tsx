'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import EventFormDialog, { type EventFormSubmitPayload } from '@/components/EventFormDialog';
import EventList from '@/components/EventList';
import { createEvent, deleteEvent, getEventCategories, getMyEvents, updateEvent } from '@/lib/eventsApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';

const PAGE_SIZE = 10;

type OrderingOption = 'start_at' | '-start_at';
type TimeFilter = 'all' | 'upcoming' | 'past';

const TIME_FILTER_OPTIONS: ReadonlyArray<{ value: TimeFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'past', label: 'Прошедшие' },
  { value: 'upcoming', label: 'Ближайшие' },
];

const EventsPage = () => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [ordering, setOrdering] = useState<OrderingOption>('start_at');
  const [page, setPage] = useState(1);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

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
      const message = error instanceof Error ? error.message : 'Не удалось сохранить событие.';
      setDialogError(message);
      throw error;
    }
  };

  const handleDelete = async (event: Event) => {
    const confirmed = window.confirm(`Удалить событие «${event.title}»?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(event.id);
      await invalidateEvents();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить событие.';
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
    setPage((prev) => prev + 1);
  };

  const currentUserId = profileQuery.data?.id ?? null;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const pendingDeleteId = deleteMutation.isPending ? deleteMutation.variables ?? null : null;

  return (
    <section className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">Мои события</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Управляйте мероприятиями, фильтруйте по параметрам и приглашайте коллег.
          </p>
        </header>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-3 self-start rounded-2xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:self-auto"
        >
          <span aria-hidden>＋</span>
          Создать событие
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <label htmlFor="events-search" className="mb-1 text-xs font-semibold uppercase text-neutral-500">
              Поиск
            </label>
            <input
              id="events-search"
              value={search}
              onChange={handleSearchChange}
              placeholder="Название, описание или локация"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div className="flex flex-col">
            <label htmlFor="events-category" className="mb-1 text-xs font-semibold uppercase text-neutral-500">
              Категория
            </label>
            <select
              id="events-category"
              value={category}
              onChange={handleCategoryChange}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              disabled={categoriesQuery.isLoading}
            >
              <option value="">Все категории</option>
              {(categoriesQuery.data ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {categoriesQuery.isError ? (
              <button
                type="button"
                onClick={() => categoriesQuery.refetch()}
                className="mt-2 self-start text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Обновить список категорий
              </button>
            ) : null}
          </div>

          <div className="flex flex-col">
            <label htmlFor="events-time-filter" className="mb-1 text-xs font-semibold uppercase text-neutral-500">
              Период
            </label>
            <select
              id="events-time-filter"
              value={timeFilter}
              onChange={handleTimeFilterChange}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {TIME_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label htmlFor="events-ordering" className="mb-1 text-xs font-semibold uppercase text-neutral-500">
              Сортировка
            </label>
            <select
              id="events-ordering"
              value={ordering}
              onChange={handleOrderingChange}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="start_at">По дате начала (возрастание)</option>
              <option value="-start_at">По дате начала (убывание)</option>
            </select>
          </div>
        </div>

        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Найдено: <span className="font-medium text-neutral-700 dark:text-neutral-200">{totalCount}</span>
          </p>
        </div>
      </div>

      {eventsQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Не удалось загрузить события.{' '}
          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            className="font-medium underline underline-offset-4 hover:text-red-700 dark:hover:text-red-200"
          >
            Попробовать снова
          </button>
        </div>
      ) : (
        <EventList
          events={events}
          isLoading={eventsQuery.isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          currentUserId={currentUserId}
          pendingDeleteId={pendingDeleteId}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handlePrevPage}
          disabled={page <= 1 || eventsQuery.isLoading}
          className="inline-flex items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          ← Назад
        </button>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Страница {page} из {totalPages}
        </span>
        <button
          type="button"
          onClick={handleNextPage}
          disabled={page >= totalPages || eventsQuery.isLoading}
          className="inline-flex items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Вперёд →
        </button>
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
