'use client';

import Link from 'next/link';
import { type JSX } from 'react';

import EventExportMenu from '@/components/EventExportMenu';
import { t } from '@/lib/i18n';

type EventHeaderActionsProps = {
  eventId: number;
  canInvite: boolean;
  onInvite: () => void;
  className?: string;
};

const InviteIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="10" cy="7" r="4" />
    <path d="M20 8v4" />
    <path d="M22 10h-4" />
  </svg>
);

const BackIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </svg>
);

const actionButtonBase =
  'btn btn--pill inline-flex min-h-[48px] items-center justify-center gap-2 px-4 text-sm font-semibold max-[379px]:px-3 flex-shrink-0';
const fullLabelClass = 'max-[379px]:hidden';

const EventHeaderActions = ({
  eventId,
  canInvite,
  onInvite,
  className = '',
}: EventHeaderActionsProps): JSX.Element => (
  <div
    className={[
      'flex w-full flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-3',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <button
      type="button"
      onClick={onInvite}
      className={[actionButtonBase, 'btn--success'].join(' ')}
      disabled={!canInvite}
      aria-label={t('event.header.actions.invite')}
      title={t('event.header.actions.invite')}
    >
      <InviteIcon className="h-5 w-5" />
      <span className={fullLabelClass}>{t('event.header.actions.invite')}</span>
    </button>
    <EventExportMenu eventId={eventId} />
    <Link
      href="/events"
      className={[actionButtonBase, 'btn--ghost'].join(' ')}
      aria-label={t('event.header.actions.back')}
      title={t('event.header.actions.back')}
    >
      <BackIcon className="h-5 w-5" aria-hidden="true" />
      <span className={fullLabelClass}>{t('event.header.actions.back')}</span>
    </Link>
  </div>
);

export default EventHeaderActions;
