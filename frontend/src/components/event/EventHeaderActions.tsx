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

const EventHeaderActions = ({
  eventId,
  canInvite,
  onInvite,
  className = '',
}: EventHeaderActionsProps): JSX.Element => (
  <div
    className={['flex w-full flex-wrap items-center gap-3 sm:justify-end', className].filter(Boolean).join(' ')}
  >
    <button type="button" onClick={onInvite} className="btn btn--success btn--pill" disabled={!canInvite}>
      {t('event.header.actions.invite')}
    </button>
    <EventExportMenu eventId={eventId} />
    <Link href="/events" className="btn btn--ghost btn--pill">
      {t('event.header.actions.back')}
    </Link>
  </div>
);

export default EventHeaderActions;
