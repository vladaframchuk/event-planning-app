'use client';

import Image from 'next/image';
import { useMemo, type JSX } from 'react';

import { t } from '@/lib/i18n';
import type { Participant, Role } from '@/types/event';

type ParticipantsTableProps = {
  participants: Participant[];
  currentUserId: number | null;
  isLoading: boolean;
  canManage: boolean;
  roleChangingId: number | null;
  removingId: number | null;
  onRoleChange: (participantId: number, role: Role) => void;
  onRemove: (participantId: number) => void;
};

const formatJoinedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t('event.participants.table.dateUnknown');
  }
  return parsed.toLocaleDateString('ru', { dateStyle: 'medium' });
};

const computeInitials = (name: string | null, email: string): string => {
  const normalized = name?.trim() ?? '';
  if (normalized) {
    const parts = normalized.split(/\s+/u).slice(0, 2);
    const letters = parts.map((part) => part.charAt(0).toUpperCase());
    const initials = letters.join('');
    if (initials) {
      return initials;
    }
  }
  return email.charAt(0).toUpperCase() || t('app.header.defaultInitials');
};

const ParticipantsTable = ({
  participants,
  currentUserId,
  isLoading,
  canManage,
  roleChangingId,
  removingId,
  onRoleChange,
  onRemove,
}: ParticipantsTableProps): JSX.Element => {
  const organizerIds = useMemo(() => participants.filter((item) => item.role === 'organizer').map((item) => item.id), [participants]);
  const soleOrganizerId = organizerIds.length === 1 ? organizerIds[0] : null;

  const roleOptions: Array<{ value: Role; label: string }> = [
    { value: 'organizer', label: t('event.participants.table.role.organizer') },
    { value: 'member', label: t('event.participants.table.role.member') },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">
              {t('event.participants.table.headers.name')}
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              {t('event.participants.table.headers.email')}
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              {t('event.participants.table.headers.role')}
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              {t('event.participants.table.headers.joinedAt')}
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              {t('event.participants.table.headers.actions')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 text-neutral-700 dark:divide-neutral-800 dark:text-neutral-200">
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {t('event.participants.table.loading')}
              </td>
            </tr>
          ) : null}
          {!isLoading && participants.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {t('event.participants.table.empty')}
              </td>
            </tr>
          ) : null}
          {!isLoading
            ? participants.map((participant) => {
                const isCurrentUser = participant.user.id === currentUserId;
                const isSoleOrganizer = soleOrganizerId === participant.id;
                const roleDisabled =
                  !canManage || isSoleOrganizer || roleChangingId === participant.id || removingId === participant.id;
                const removeDisabled = !canManage || isSoleOrganizer || removingId === participant.id;
                const avatarInitials = computeInitials(participant.user.name, participant.user.email);
                const joinedLabel = formatJoinedAt(participant.joinedAt);

                return (
                  <tr key={participant.id} className="bg-white dark:bg-neutral-900">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 text-xs font-semibold uppercase text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {participant.user.avatar ? (
                            <Image
                              src={participant.user.avatar}
                              alt={participant.user.name ?? participant.user.email}
                              fill
                              sizes="40px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">{avatarInitials}</span>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {participant.user.name?.trim() || participant.user.email}
                          </p>
                          {isCurrentUser ? (
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                              {t('event.participants.table.badge.current')}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-600 dark:text-neutral-300">{participant.user.email}</td>
                    <td className="px-4 py-4">
                      <select
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:disabled:bg-neutral-800"
                        value={participant.role}
                        onChange={(event) => onRoleChange(participant.id, event.currentTarget.value as Role)}
                        disabled={roleDisabled}
                        aria-disabled={roleDisabled}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-neutral-600 dark:text-neutral-300">{joinedLabel}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(participant.id)}
                        disabled={removeDisabled}
                        className="inline-flex items-center rounded-lg border border-red-500 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:opacity-70 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/30 dark:disabled:border-neutral-700 dark:disabled:text-neutral-500"
                      >
                        {removingId === participant.id
                          ? t('event.participants.table.actions.removing')
                          : t('event.participants.table.actions.remove')}
                      </button>
                    </td>
                  </tr>
                );
              })
            : null}
        </tbody>
      </table>
    </div>
  );
};

export default ParticipantsTable;
