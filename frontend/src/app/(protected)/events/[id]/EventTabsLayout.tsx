'use client';

import { usePathname } from 'next/navigation';
import { type JSX, type ReactNode, useMemo, useState } from 'react';

import EventHeaderActions from '@/components/event/EventHeaderActions';
import EventNavigation from '@/components/EventNavigation';
import EventProgressBar from '@/components/EventProgressBar';
import InviteDialog from '@/components/InviteDialog';

type EventTabsLayoutProps = {
  eventId: number;
  isOrganizer: boolean;
  title: string;
  subtitle?: string;
  description?: ReactNode;
  sidePanel?: ReactNode;
  children?: ReactNode;
  isLoading?: boolean;
  skeleton?: ReactNode;
};

const defaultSkeleton = (
  <div className="flex flex-col gap-6">
    <div className="skeleton h-8 w-32 rounded-full" />
    <div className="skeleton h-14 w-2/3 rounded-2xl" />
    <div className="skeleton h-6 w-1/2 rounded-2xl" />
    <div className="skeleton h-56 w-full rounded-3xl" />
  </div>
);

const actionsSkeleton = (
  <div className="flex w-full flex-wrap gap-3">
    <div className="skeleton h-12 w-44 rounded-full" />
    <div className="skeleton h-12 w-48 rounded-full" />
    <div className="skeleton h-12 w-40 rounded-full" />
  </div>
);

const navigationSkeleton = (
  <div className="rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-5 pb-6 pt-8 shadow-sm">
    <div className="mb-5 h-4 w-36 rounded-full bg-[var(--color-border-subtle)]" />
    <div className="flex flex-col gap-3">
      <div className="skeleton h-12 w-full rounded-2xl" />
      <div className="skeleton h-12 w-full rounded-2xl" />
      <div className="skeleton h-12 w-full rounded-2xl" />
      <div className="skeleton h-12 w-full rounded-2xl" />
    </div>
  </div>
);

const EventTabsLayout = ({
  eventId,
  isOrganizer,
  title,
  subtitle,
  description,
  sidePanel,
  children,
  isLoading = false,
  skeleton,
}: EventTabsLayoutProps): JSX.Element => {
  const pathname = usePathname();
  const [isInviteOpen, setInviteOpen] = useState(false);

  const content = useMemo(
    () => (isLoading ? skeleton ?? defaultSkeleton : children ?? null),
    [children, isLoading, skeleton],
  );

  const navigation = isLoading ? navigationSkeleton : <EventNavigation eventId={eventId} isOrganizer={isOrganizer} />;

  const handleInviteOpen = () => {
    if (!isOrganizer) {
      return;
    }
    setInviteOpen(true);
  };

  return (
    <>
      <section className="w-full px-4 pb-16 pt-10 sm:px-8 lg:px-16 xl:px-24">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
          <header
            className="rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-8 shadow-[var(--shadow-md)] sm:px-10 sm:py-10"
            role="banner"
          >
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {subtitle ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                      {subtitle}
                    </p>
                  ) : null}
                  <h1 className="text-[clamp(2.125rem,3vw,2.875rem)] font-semibold leading-[1.08] text-[var(--color-text-primary)]">
                    {title}
                  </h1>
                  {description ? (
                    <div className="max-w-3xl text-base leading-[var(--line-height-relaxed)] text-[var(--color-text-secondary)]">
                      {description}
                    </div>
                  ) : null}
                </div>
                {isLoading ? (
                  actionsSkeleton
                ) : (
                  <EventHeaderActions
                    eventId={eventId}
                    canInvite={isOrganizer}
                    onInvite={handleInviteOpen}
                    className="lg:max-w-[420px]"
                  />
                )}
              </div>
              <EventProgressBar eventId={eventId} />
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-5 pb-9 pt-7 shadow-sm sm:px-10 sm:pb-11 sm:pt-9">
              <div key={pathname} className="event-tab-transition flex flex-col gap-8">
                {content}
              </div>
            </div>

            <aside className="flex flex-col gap-6 lg:sticky lg:top-28">
              {navigation}
              {sidePanel ? (
                <div className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-6 shadow-sm">
                  {sidePanel}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      {isOrganizer ? (
        <InviteDialog eventId={eventId} open={isInviteOpen} onClose={() => setInviteOpen(false)} />
      ) : null}
    </>
  );
};

export default EventTabsLayout;
