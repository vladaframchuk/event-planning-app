'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { isAuthenticated } from '@/lib/authClient';
import { acceptInvite, validateInvite, type ValidateInviteResponse } from '@/lib/invitesApi';

const PENDING_TOKEN_STORAGE_KEY = 'epa_pending_invite_token';
const INVITE_SUCCESS_TOAST_KEY = 'epa_invite_join_success';

const inviteDateFormatter = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

const formatDate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return inviteDateFormatter.format(date);
};

const buildStatusMessage = (status: ValidateInviteResponse['status']): string => {
  switch (status) {
    case 'ok':
      return 'Ссылка действительна. Присоединяйтесь к событию.';
    case 'expired':
      return 'Срок действия ссылки истёк.';
    case 'revoked':
      return 'Ссылка была отозвана организатором.';
    case 'exhausted':
      return 'Количество использований ссылки исчерпано.';
    case 'not_found':
    default:
      return 'Ссылка не найдена или недоступна.';
  }
};

const JoinPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get('token') ?? '').trim(), [searchParams]);

  const [isAuth, setIsAuth] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIsAuth(isAuthenticated());
  }, []);

  const inviteQuery = useQuery<ValidateInviteResponse, Error>({
    queryKey: ['invite', token],
    queryFn: () => validateInvite(token),
    enabled: token.length > 0,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: (payload) => {
      if (payload.message === 'joined') {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(INVITE_SUCCESS_TOAST_KEY, '1');
        }
        router.push(`/events/${payload.event_id}`);
        return;
      }
      setFeedback('Вы уже участник этого события.');
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Не удалось присоединиться к событию. Попробуйте позже.';
      setFeedback(message);
    },
  });

  const handleAuthRedirect = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PENDING_TOKEN_STORAGE_KEY, token);
    }
    router.push('/login');
  };

  const handleJoin = () => {
    setFeedback(null);
    acceptMutation.mutate();
  };

  if (token.length === 0) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Приглашение</h1>
        <p className="mt-2 text-sm">Укажите токен приглашения в адресной строке.</p>
        <Link
          href="/events"
          className="mt-4 inline-flex items-center text-sm font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700 dark:text-blue-400"
        >
          Перейти к событиям
        </Link>
      </section>
    );
  }

  if (inviteQuery.isLoading) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
        Проверяем ссылку приглашения…
      </section>
    );
  }

  if (inviteQuery.isError || !inviteQuery.data) {
    return (
      <section className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <h1 className="text-2xl font-semibold">Ошибка проверки ссылки</h1>
        <p className="mt-2 text-sm">
          {inviteQuery.error?.message ?? 'Попробуйте обновить страницу или запросите новую ссылку у организатора.'}
        </p>
        <button
          type="button"
          onClick={() => inviteQuery.refetch()}
          className="mt-4 inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Повторить
        </button>
      </section>
    );
  }

  const invite = inviteQuery.data;
  const statusMessage = buildStatusMessage(invite.status);
  const formattedStart = formatDate(invite.event?.startAt ?? null);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Приглашение на событие</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{statusMessage}</p>
      </div>

      {invite.event ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{invite.event.title}</h2>
          <dl className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            <div className="flex items-baseline gap-2">
              <dt className="w-24 text-neutral-500 dark:text-neutral-400">Когда:</dt>
              <dd>{formattedStart ?? 'Дата будет объявлена позже'}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 text-neutral-500 dark:text-neutral-400">Где:</dt>
              <dd>{invite.event.location && invite.event.location.trim().length > 0 ? invite.event.location : 'Уточняется'}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 text-neutral-500 dark:text-neutral-400">Статус:</dt>
              <dd className="capitalize">{invite.status}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 text-neutral-500 dark:text-neutral-400">Действует до:</dt>
              <dd>{formatDate(invite.expiresAt) ?? '—'}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="w-24 text-neutral-500 dark:text-neutral-400">Осталось:</dt>
              <dd>{invite.usesLeft === null ? 'Без ограничений' : invite.usesLeft}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          {feedback}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/events"
          className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          На главную
        </Link>

        {invite.status === 'ok' ? (
          isAuth ? (
            <button
              type="button"
              onClick={handleJoin}
              disabled={acceptMutation.isPending}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {acceptMutation.isPending ? 'Присоединяем…' : 'Присоединиться'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAuthRedirect}
              className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Войти / Зарегистрироваться
            </button>
          )
        ) : null}
      </div>
    </section>
  );
};

const JoinPage = () => {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          Загрузка страницы приглашения…
        </section>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
};

export default JoinPage;
