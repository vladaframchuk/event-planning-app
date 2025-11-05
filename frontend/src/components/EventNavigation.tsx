'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, type JSX } from 'react';

import { t } from '@/lib/i18n';

type EventNavigationProps = {
  eventId: number;
  className?: string;
  isOrganizer?: boolean;
  variant?: 'sidebar' | 'mobile';
};

const navIcons: Record<string, JSX.Element> = {
  overview: (
    <svg
      className="h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h18" />
      <path d="M3 6h18" />
      <path d="M3 18h18" />
    </svg>
  ),
  participants: (
    <svg
      className="h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="4" />
      <path d="M17 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4" />
      <path d="M17 13h2a4 4 0 0 1 4 4v4" />
    </svg>
  ),
  chat: (
    <svg
      className="h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
    </svg>
  ),
  polls: (
    <svg
      className="h-5 w-5"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19h16" />
      <path d="M7 10h3v9H7z" />
      <path d="M14 5h3v14h-3z" />
    </svg>
  ),
};

const EventNavigation = ({
  eventId,
  className = '',
  isOrganizer = false,
  variant = 'sidebar',
}: EventNavigationProps) => {
  const pathname = usePathname() ?? '';
  const basePath = `/events/${eventId}`;

  const links = useMemo(() => {
    const currentPath =
      pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
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

  if (variant === 'mobile') {
    return (
      <nav
        aria-label={t('event.navigation.ariaLabel')}
        className={[
          'lg:hidden',
          'w-full rounded-[22px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)]/95 shadow-[var(--shadow-sm)] backdrop-blur supports-[backdrop-filter]:bg-[color:rgba(255,255,255,0.92)]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ touchAction: 'manipulation', paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
      >
        <ul className="grid grid-cols-2 gap-2 p-2">
          {links.map((link) => {
            const iconKey = link.href.endsWith('/polls')
              ? 'polls'
              : link.href.endsWith('/chat')
                ? 'chat'
                : link.href.endsWith('/participants')
                  ? 'participants'
                  : 'overview';
            const isActive = link.active;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'group flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[18px] px-3 py-2 text-xs font-semibold transition-[transform,background,color]',
                    'duration-[var(--transition-medium)] ease-[var(--easing-standard)]',
                    isActive
                      ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] shadow-[var(--shadow-sm)]'
                      : 'bg-transparent text-[var(--color-text-secondary)] hover:-translate-y-[1px] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-primary)]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'transition-colors duration-[var(--transition-medium)] ease-[var(--easing-standard)]',
                      isActive
                        ? 'text-[var(--color-text-inverse)]'
                        : 'text-[var(--color-text-secondary)] group-hover:text-[var(--color-accent-primary)]',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {navIcons[iconKey]}
                  </span>
                  <span className="text-[11px] leading-tight">{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label={t('event.navigation.ariaLabel')}
      className={[
        'hidden flex-col rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 pb-5 pt-6 shadow-sm lg:flex',
        'sm:px-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-[var(--color-text-muted)] mb-[9rem] text-xs font-semibold uppercase tracking-[0.18em]">
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
              <Link
                href={link.href}
                className={itemClassName}
                aria-current={link.active ? 'page' : undefined}
              >
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
