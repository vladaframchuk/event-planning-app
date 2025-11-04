'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type JSX } from 'react';

import EventStateCard from '@/components/EventStateCard';
import ParticipantsTable from '@/components/participants/ParticipantsTable';
import { getParticipants, removeParticipant, updateParticipantRole } from '@/lib/api/participants';
import { getEventById } from '@/lib/eventsApi';
import { t } from '@/lib/i18n';
import { createInvite } from '@/lib/invitesApi';
import { getMe, type Profile } from '@/lib/profileApi';
import type { Event, Participant, Role } from '@/types/event';

import EventTabsLayout from '../EventTabsLayout';

type ToastState = { id: number; message: string; tone: 'success' | 'error' } | null;

const participantsSkeleton = (
  <div className="flex flex-col gap-4">
    <div className="skeleton h-6 w-48 rounded-full" />
    <div className="skeleton h-64 w-full rounded-3xl" />
  </div>
);

const ParticipantsPage = (): JSX.Element => {
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
    const timeout = window.setTimeout(() => setToast(null), 3200);
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
        throw new Error(t('event.participants.errors.eventMissing'));
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
      const message = error instanceof Error ? error.message : t('event.participants.errors.roleUpdateGeneric');
      setToast({ id: Date.now(), message, tone: 'error' });
    },
    onSuccess: () => {
      setToast({ id: Date.now(), message: t('event.participants.toast.roleUpdated'), tone: 'success' });
    },
    onSettled: () => {
      setRoleChangingId(null);
      queryClient.invalidateQueries({ queryKey: participantsQueryKey });
    },
  });

  const removeMutation = useMutation<void, Error, { participantId: number }, { previous?: Participant[] }>({
    mutationFn: ({ participantId }) => {
      if (eventId === null) {
        throw new Error(t('event.participants.errors.eventMissing'));
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
      const message = error instanceof Error ? error.message : t('event.participants.errors.removeParticipant');
      setToast({ id: Date.now(), message, tone: 'error' });
    },
    onSuccess: () => {
      setToast({ id: Date.now(), message: t('event.participants.toast.participantRemoved'), tone: 'success' });
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
        setToast({ id: Date.now(), message: t('event.participants.toast.inviteCopied'), tone: 'success' });
      } else {
        setToast({
          id: Date.now(),
          message: t('event.participants.toast.inviteReady', { url: invite.invite_url }),
          tone: 'success',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('event.participants.errors.inviteCreate');
      setToast({ id: Date.now(), message, tone: 'error' });
    } finally {
      setCopyPending(false);
    }
  };

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

  if (eventQuery.isLoading || profileQuery.isLoading) {
    return (
      <EventTabsLayout
        eventId={eventId}
        isOrganizer
        title={t('event.tabs.loadingTitle')}
        subtitle={t('event.participants.header.subtitle')}
        description={t('event.participants.subtitle')}
        isLoading
        skeleton={participantsSkeleton}
      />
    );
  }

  if (eventQuery.isError || !eventQuery.data) {
    const message = eventQuery.error?.message ?? t('event.participants.errors.eventLoad');
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EventStateCard
          tone="error"
          title={t('event.participants.errors.eventLoadTitle')}
          description={message}
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

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EventStateCard
          tone="error"
          title={t('event.participants.errors.profileLoadTitle')}
          description={profileQuery.error?.message ?? t('event.participants.errors.profileLoad')}
        />
      </div>
    );
  }

  const event = eventQuery.data;
  const currentUserId = profileQuery.data.id ?? null;
  const participantsError = participantsQuery.error ?? null;

  const copyInviteButton = isOrganizer ? (
    <button
      type="button"
      onClick={handleCopyInvite}
      disabled={isCopyPending}
      className="btn btn--primary btn--pill"
    >
      {isCopyPending ? t('event.participants.buttons.copyInviteLoading') : t('event.participants.buttons.copyInvite')}
    </button>
  ) : null;

  const sidePanel = (
    <dl className="flex flex-col gap-5 text-sm text-[var(--color-text-secondary)]">
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.participants.info.total')}
        </dt>
        <dd className="text-base font-semibold text-[var(--color-text-primary)]">
          {participants.length}
        </dd>
      </div>
      <div className="flex flex-col gap-2">
        <dt className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-[0.18em]">
          {t('event.participants.info.organizer')}
        </dt>
        <dd className="text-base font-medium text-[var(--color-text-primary)]">{event.owner.email}</dd>
      </div>
    </dl>
  );

  const mainContent = !isOrganizer ? (
    <div className="rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-8 text-sm text-[var(--color-text-secondary)] shadow-sm">
      {t('event.participants.noAccess')}
    </div>
  ) : participantsError ? (
    <div className="rounded-3xl border border-[var(--color-error-soft)] bg-[var(--color-error-soft)]/45 px-6 py-8 text-sm text-[var(--color-error)] shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        {t('event.participants.errors.listTitle')}
      </h2>
      <p className="mt-2 text-sm">{participantsError.message}</p>
      <button
        type="button"
        onClick={() => participantsQuery.refetch()}
        className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--color-accent-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-accent-primary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:border-[var(--color-accent-primary-strong)] hover:text-[var(--color-accent-primary-strong)]"
      >
        {t('event.participants.buttons.retry')}
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
  );

  return (
    <>
      <EventTabsLayout
        eventId={event.id}
        isOrganizer={isOrganizer}
        title={event.title}
        subtitle={t('event.participants.header.subtitle')}
        description={t('event.participants.subtitle')}
        sidePanel={sidePanel}
        skeleton={participantsSkeleton}
      >
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-[clamp(1.5rem,2.4vw,1.875rem)] font-semibold text-[var(--color-text-primary)]">
              {t('event.participants.heading')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('event.participants.header.description')}
            </p>
          </div>
          {copyInviteButton}
        </header>
        {mainContent}
      </EventTabsLayout>

      {toast ? (
        <div
          className={[
            'fixed right-6 top-6 z-50 rounded-full px-5 py-3 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--shadow-md)]',
            toast.tone === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]',
          ].join(' ')}
          role="status"
        >
          <div className="flex items-center gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-xs uppercase tracking-[0.2em]"
            >
              {t('event.participants.toast.close')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ParticipantsPage;
