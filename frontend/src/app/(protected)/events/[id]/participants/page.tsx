'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import EventNavigation from '@/components/EventNavigation';
import ParticipantsTable from '@/components/participants/ParticipantsTable';
import { getParticipants, removeParticipant, updateParticipantRole } from '@/lib/api/participants';
import { getEventById } from '@/lib/eventsApi';
import { createInvite } from '@/lib/invitesApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event, Participant, Role } from '@/types/event';

type ToastState = { id: number; message: string; type: 'success' | 'error' } | null;

const ParticipantsPage = () => {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [toast, setToast] = useState<ToastState>(null);
  const [roleChangingId, setRoleChangingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [isCopyPending, setCopyPending] = useState(false);

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

  const viewerRole: Role | null = useMemo(() => {
    const event = eventQuery.data;
    const profile = profileQuery.data;
    if (!event) {
      return null;
    }
    if (event.viewerRole) {
      return event.viewerRole;
    }
    if (profile && event.owner.id === profile.id) {
      return 'organizer';
    }
    return null;
  }, [eventQuery.data, profileQuery.data]);

  const isOrganizer = viewerRole === 'organizer';

  const participantsQueryKey: readonly [string, number | null] = ['eventParticipants', eventId];

  const participantsQuery = useQuery<Participant[], Error>({
    queryKey: participantsQueryKey,
    queryFn: () => getParticipants(eventId as number),
    enabled: eventId !== null && isOrganizer,
  });

  const participants = participantsQuery.data ?? [];

  const roleMutation = useMutation<void, Error, { participantId: number; role: Role }, { previous?: Participant[] }>({
    mutationFn: ({ participantId, role }) => {
      if (eventId === null) {
        throw new Error('Событие не найдено.');
      }
      return updateParticipantRole(eventId, participantId, role);
    },
    onMutate: async ({ participantId, role }) => {
      setRoleChangingId(participantId);
      await queryClient.cancelQueries({ queryKey: participantsQueryKey });
      const previous = queryClient.getQueryData<Participant[]>(participantsQueryKey) ?? undefined;
      if (previous) {
        const updated = previous.map((item) => (item.id === participantId ? { ...item, role } : item));
        queryClient.setQueryData(participantsQueryKey, updated);
      }
      return { previous };
    },
    onError: (error, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(participantsQueryKey, context.previous);
      }
      const message = error instanceof Error ? error.message : 'Не удалось изменить роль участника.';
      setToast({ id: Date.now(), message, type: 'error' });
    },
    onSuccess: () => {
      setToast({ id: Date.now(), message: 'Роль участника обновлена.', type: 'success' });
    },
    onSettled: () => {
      setRoleChangingId(null);
      queryClient.invalidateQueries({ queryKey: participantsQueryKey });
    },
  });

  const removeMutation = useMutation<void, Error, { participantId: number }, { previous?: Participant[] }>({
    mutationFn: ({ participantId }) => {
      if (eventId === null) {
        throw new Error('Событие не найдено.');
      }
      return removeParticipant(eventId, participantId);
    },
    onMutate: async ({ participantId }) => {
      setRemovingId(participantId);
      await queryClient.cancelQueries({ queryKey: participantsQueryKey });
      const previous = queryClient.getQueryData<Participant[]>(participantsQueryKey) ?? undefined;
      if (previous) {
        const updated = previous.filter((item) => item.id !== participantId);
        queryClient.setQueryData(participantsQueryKey, updated);
      }
      return { previous };
    },
    onError: (error, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(participantsQueryKey, context.previous);
      }
      const message = error instanceof Error ? error.message : 'Не удалось удалить участника.';
      setToast({ id: Date.now(), message, type: 'error' });
    },
    onSuccess: () => {
      setToast({ id: Date.now(), message: 'Участник удалён.', type: 'success' });
    },
    onSettled: () => {
      setRemovingId(null);
      queryClient.invalidateQueries({ queryKey: participantsQueryKey });
    },
  });

  const handleRoleChange = (participantId: number, role: Role) => {
    const current = participants.find((item) => item.id === participantId);
    if (!current || current.role === role) {
      return;
    }
    roleMutation.mutate({ participantId, role });
  };

  const handleRemove = (participantId: number) => {
    removeMutation.mutate({ participantId });
  };

  const handleCopyInvite = async () => {
    if (eventId === null) {
      return;
    }
    setCopyPending(true);
    try {
      const invite = await createInvite(eventId, { expiresInHours: 48, maxUses: 0 });
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(invite.invite_url);
        setToast({ id: Date.now(), message: 'Ссылка приглашения скопирована.', type: 'success' });
      } else {
        setToast({ id: Date.now(), message: invite.invite_url, type: 'success' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось скопировать ссылку.';
      setToast({ id: Date.now(), message, type: 'error' });
    } finally {
      setCopyPending(false);
    }
  };

  if (eventId === null) {
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Не удалось определить событие.</h1>
        <p className="mt-2 text-sm">Проверьте ссылку и попробуйте снова.</p>
      </section>
    );
  }

  if (eventQuery.isLoading || profileQuery.isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
        <EventNavigation eventId={eventId} />
        <section className="flex-1 rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          Загрузка данных...
        </section>
      </main>
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    const message = eventQuery.error?.message ?? 'Не удалось загрузить событие.';
    return (
      <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-xl font-semibold">Ошибка загрузки события</h1>
        <p className="mt-2 text-sm">{message}</p>
      </section>
    );
  }

  const currentUserId = profileQuery.data?.id ?? null;
  const participantsError = participantsQuery.error ?? null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row">
      <EventNavigation eventId={eventId} />
      <section className="flex-1 space-y-6">
        {toast ? (
          <div
            role="status"
            className={`fixed right-8 top-8 z-40 flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg transition ${
              toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-600 text-white'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-4 text-xs font-semibold uppercase tracking-wide text-white/80 hover:text-white"
            >
              Закрыть
            </button>
          </div>
        ) : null}

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Участники</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Управляйте ролями и приглашениями.</p>
          </div>
          {isOrganizer ? (
            <button
              type="button"
              onClick={handleCopyInvite}
              disabled={isCopyPending}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/70"
            >
              {isCopyPending ? 'Ссылка...' : 'Скопировать ссылку'}
            </button>
          ) : null}
        </header>

        {!isOrganizer ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            Только организаторы могут управлять участниками события.
          </div>
        ) : participantsError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <h2 className="text-lg font-semibold">Ошибка загрузки участников</h2>
            <p className="mt-2">{participantsError.message}</p>
            <button
              type="button"
              onClick={() => participantsQuery.refetch()}
              className="mt-4 inline-flex items-center rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30"
            >
              Повторить попытку
            </button>
          </div>
        ) : (
          <ParticipantsTable
            participants={participants}
            currentUserId={currentUserId}
            isLoading={participantsQuery.isLoading}
            canManage={isOrganizer}
            roleChangingId={roleChangingId}
            removingId={removingId}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
          />
        )}
      </section>
    </main>
  );
};

export default ParticipantsPage;
