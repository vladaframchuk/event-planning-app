'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import EventNavigation from '@/components/EventNavigation';
import PollCard from '@/components/PollCard';
import PollCreateDialog from '@/components/PollCreateDialog';
import { getEventById } from '@/lib/eventsApi';
import { closePoll, deletePoll, listPolls, vote } from '@/lib/pollsApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';
import type { Poll } from '@/types/poll';

type ToastState = { id: number; message: string; type: 'success' | 'error' } | null;
type PollListResponse = { results: Poll[]; count: number };

const PAGE_SIZE = 10;

const PollsPage = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
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
    const timeout = window.setTimeout(() => setToast(null), 3000);
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

  const polls: Poll[] = pollsQuery.data?.results ?? [];
  const pollCount = pollsQuery.data?.count ?? 0;
  const totalPages = pollCount > 0 ? Math.ceil(pollCount / PAGE_SIZE) : 1;

  const isOwner = Boolean(
    eventQuery.data && profileQuery.data && eventQuery.data.owner.id === profileQuery.data.id,
  );

  const voteMutation = useMutation<Poll, Error, { pollId: number; optionIds: number[] }>({
    mutationFn: ({ pollId, optionIds }) => vote(pollId, optionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: 'Голос сохранён.', type: 'success' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить голос.';
      setToast({ id: Date.now(), message, type: 'error' });
    },
  });

  const closeMutation = useMutation<void, Error, { pollId: number }>({
    mutationFn: ({ pollId }) => closePoll(pollId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: 'Опрос закрыт.', type: 'success' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Не удалось закрыть опрос.';
      setToast({ id: Date.now(), message, type: 'error' });
    },
  });

  const deleteMutation = useMutation<void, Error, { pollId: number }>({
    mutationFn: ({ pollId }) => deletePoll(pollId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
      setToast({ id: Date.now(), message: 'Опрос удалён.', type: 'success' });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Не удалось удалить опрос.';
      setToast({ id: Date.now(), message, type: 'error' });
    },
  });

  if (eventId === null) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Событие не найдено</h1>
        <p className="mt-2 text-sm">Проверьте ссылку и попробуйте снова.</p>
        <button
          type="button"
          onClick={() => router.push('/events')}
          className="mt-4 inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          К списку событий
        </button>
      </section>
    );
  }

  const isLoading = pollsQuery.isLoading || eventQuery.isLoading || profileQuery.isLoading;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Опросы</h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Коллективно решайте рабочие и организационные вопросы.
              </p>
              {eventQuery.data ? (
                <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Событие: {eventQuery.data.title}
                </p>
              ) : null}
            </div>
            {isOwner ? (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Создать опрос
              </button>
            ) : null}
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">Показать:</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    filter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  Все
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('open')}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    filter === 'open'
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  Открытые
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('closed')}
                  className={`rounded-full px-3 py-1 text-sm transition ${
                    filter === 'closed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                  }`}
                >
                  Закрытые
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-600 dark:text-neutral-300">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="rounded-lg border border-neutral-300 px-3 py-1 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Назад
              </button>
              <span>
                Страница {page} из {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-neutral-300 px-3 py-1 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Вперёд
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center rounded-2xl border border-neutral-200 bg-white p-10 text-neutral-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              Загружаем опросы...
            </div>
          ) : pollsQuery.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 shadow-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <h2 className="text-lg font-semibold">Не удалось загрузить опросы</h2>
              <p className="mt-2 text-sm">{pollsQuery.error?.message ?? 'Попробуйте обновить страницу позже.'}</p>
              <button
                type="button"
                onClick={() => pollsQuery.refetch()}
                className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Повторить попытку
              </button>
            </div>
          ) : eventQuery.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 shadow-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <h2 className="text-lg font-semibold">Не удалось загрузить данные о событии</h2>
              <p className="mt-2 text-sm">
                {eventQuery.error?.message ?? 'Попробуйте обновить страницу или вернитесь позднее.'}
              </p>
            </div>
          ) : polls.length > 0 ? (
            <div className="flex flex-col gap-5">
              {polls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  isOwner={isOwner}
                  votePending={voteMutation.isPending && voteMutation.variables?.pollId === poll.id}
                  closePending={closeMutation.isPending && closeMutation.variables?.pollId === poll.id}
                  deletePending={deleteMutation.isPending && deleteMutation.variables?.pollId === poll.id}
                  onVote={(optionIds) => voteMutation.mutate({ pollId: poll.id, optionIds })}
                  onClose={() => closeMutation.mutate({ pollId: poll.id })}
                  onDelete={() => deleteMutation.mutate({ pollId: poll.id })}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-sm text-neutral-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
              Опросов пока нет.{' '}
              {isOwner ? 'Создайте новый и пригласите участников проголосовать.' : 'Ожидайте действий организатора.'}
            </div>
          )}

          {toast ? (
            <div
              className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
                toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-600'
              }`}
            >
              {toast.message}
            </div>
          ) : null}

          {isOwner ? (
            <PollCreateDialog
              open={isDialogOpen}
              eventId={eventId}
              onClose={() => setDialogOpen(false)}
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ['polls', eventId], exact: false });
                setToast({ id: Date.now(), message: 'Опрос создан.', type: 'success' });
              }}
            />
          ) : null}
        </div>
        <EventNavigation eventId={eventId} className="lg:mt-0" />
      </div>
    </section>
  );
};

export default PollsPage;
