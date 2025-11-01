'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import EventExportMenu from '@/components/EventExportMenu';
import EventNavigation from '@/components/EventNavigation';
import EventProgressBar from '@/components/EventProgressBar';
import InviteDialog from '@/components/InviteDialog';
import TaskBoard, { type TaskBoardHandle } from '@/components/TaskBoard';
import { getEventById } from '@/lib/eventsApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event } from '@/types/event';

const INVITE_SUCCESS_TOAST_KEY = 'epa_invite_join_success';
const eventDetailsDateTimeFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'full', timeStyle: 'short' });

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

const EventDetailsPage = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const taskBoardRef = useRef<TaskBoardHandle>(null);
  const [isInviteOpen, setInviteOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [isDetailsOpen, setDetailsOpen] = useState(false);

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

  const isOwner = Boolean(eventQuery.data && profileQuery.data && eventQuery.data.owner.id === profileQuery.data.id);

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
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Неверный идентификатор события</h1>
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
        Загружаем информацию о событии…
      </section>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Не удалось загрузить информацию о событии</h1>
        <p className="mt-2 text-sm">
          {eventQuery.error?.message ?? 'Попробуйте обновить страницу или вернитесь позже.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => eventQuery.refetch()}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Повторить загрузку
          </button>
          <button
            type="button"
            onClick={() => router.push('/events')}
            className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            К событиям
          </button>
        </div>
      </section>
    );
  }

  const event = eventQuery.data;
  const startAt = formatDateTime(event.startAt);
  const endAt = formatDateTime(event.endAt);

  const detailsStyles = {
    maxHeight: isDetailsOpen ? '1000px' : '0px',
    paddingTop: isDetailsOpen ? '24px' : '0px',
    paddingBottom: isDetailsOpen ? '24px' : '0px',
    opacity: isDetailsOpen ? 1 : 0,
  } as const;

  const handleAddListClick = () => {
    if (isOwner) {
      taskBoardRef.current?.openCreateListForm();
      setDetailsOpen(false);
    }
  };

  return (
    <>
      {toastVisible ? (
        <div className="mx-auto mb-4 w-full max-w-2xl rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
          Приглашение отправлено.
        </div>
      ) : null}

      <section className="flex w-full flex-col gap-6 px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <header className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">{event.title}</h1>
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Организатор: <span className="font-medium">{event.owner.email}</span>
              </p>
            </header>
            <EventProgressBar eventId={event.id} />

            <div className="flex flex-wrap items-center gap-3">
              {isOwner ? (
                <>
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                  >
                    Отправить приглашение
                  </button>
                  <button
                    type="button"
                    onClick={handleAddListClick}
                    className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                  >
                    Добавить список
                  </button>
                </>
              ) : null}
              <EventExportMenu eventId={event.id} />
              <button
                type="button"
                onClick={() => setDetailsOpen((current) => !current)}
                aria-expanded={isDetailsOpen}
                className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                {isDetailsOpen ? 'Скрыть детали' : 'Показать детали'}
              </button>
              <Link
                href="/events"
                className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Назад к событиям
              </Link>
            </div>

            <div
              className="overflow-hidden rounded-2xl border border-neutral-200 bg-white px-6 shadow-lg transition-all duration-300 ease-in-out dark:border-neutral-800 dark:bg-neutral-900"
              style={detailsStyles}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Дата начала</p>
                  <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">{startAt ?? 'Не запланировано'}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Дата окончания</p>
                  <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">{endAt ?? 'Не запланировано'}</p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Локация</p>
                  <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">
                    {event.location && event.location.trim().length > 0 ? event.location : 'Не указано'}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Категория</p>
                  <p className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">
                    {event.category && event.category.trim().length > 0 ? event.category : 'Не указано'}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Описание</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                  {event.description && event.description.trim().length > 0
                    ? event.description
                    : 'Описание пока отсутствует.'}
                </p>
              </div>
            </div>
          </div>
          <EventNavigation eventId={event.id} className="lg:mt-0" />
        </div>
      </section>

      <div className="mt-4 w-full px-4 sm:px-6 lg:px-10">
        <TaskBoard ref={taskBoardRef} eventId={event.id} showInlineAddListButton={false} />
      </div>

      {isOwner ? <InviteDialog eventId={event.id} open={isInviteOpen} onClose={() => setInviteOpen(false)} /> : null}
    </>
  );
};

export default EventDetailsPage;

