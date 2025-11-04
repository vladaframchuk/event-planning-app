'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { t } from '@/lib/i18n';

type EventNavigationProps = {
  eventId: number;
  className?: string;
  isOrganizer?: boolean;
};

const EventNavigation = ({ eventId, className = '', isOrganizer = false }: EventNavigationProps) => {
  const pathname = usePathname() ?? '';
  const basePath = `/events/${eventId}`;

  const links = useMemo(() => {
    const currentPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    const allLinks = [
      {
        href: basePath,
        label: t('event.navigation.overview'),
        active: currentPath === basePath,
      },
      {
        href: `${basePath}/participants`,
        label: t('event.navigation.participants'),
        active: currentPath.startsWith(`${basePath}/participants`),
      },
      {
        href: `${basePath}/chat`,
        label: t('event.navigation.chat'),
        active: currentPath.startsWith(`${basePath}/chat`),
      },
      {
        href: `${basePath}/polls`,
        label: t('event.navigation.polls'),
        active: currentPath.startsWith(`${basePath}/polls`),
      },
    ];
    if (!isOrganizer) {
      return allLinks.filter((link) => link.href !== `${basePath}/participants`);
    }
    return allLinks;
  }, [basePath, isOrganizer, pathname]);

  return (
    <nav
      aria-label={t('event.navigation.ariaLabel')}
      className={[
        'flex flex-col rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 pb-5 pt-6 shadow-sm',
        'sm:px-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-[var(--color-text-muted)] mb-10 text-xs font-semibold uppercase tracking-[0.18em]">
        {t('event.navigation.sectionTitle')}
      </p>
      <ul className="flex w-full flex-col gap-2">
        {links.map((link) => {
          const itemClassName = [
            'group flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-semibold transition-[transform,background,border-color,color,box-shadow]',
            'duration-[var(--transition-medium)] ease-[var(--easing-standard)]',
            link.active
              ? 'border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] shadow-[var(--shadow-sm)]'
              : 'border-[var(--color-border-subtle)] bg-transparent text-[var(--color-text-secondary)] hover:-translate-y-[1px] hover:border-[var(--color-accent-primary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-primary)]',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={link.href}>
              <Link href={link.href} className={itemClassName} aria-current={link.active ? 'page' : undefined}>
                <span>{link.label}</span>
                <span
                  className={[
                    'h-2 w-2 rounded-full transition-all duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                    link.active
                      ? 'scale-100 bg-[var(--color-text-inverse)]'
                      : 'scale-0 bg-[var(--color-accent-primary)] group-hover:scale-75',
                  ].join(' ')}
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default EventNavigation;
