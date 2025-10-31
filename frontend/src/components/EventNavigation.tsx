'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

type EventNavigationProps = {
  eventId: number;
  className?: string;
};

const EventNavigation = ({ eventId, className = '' }: EventNavigationProps) => {
  const pathname = usePathname() ?? '';
  const basePath = `/events/${eventId}`;

  const links = useMemo(() => {
    const currentPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
    return [
      {
        href: basePath,
        label: 'Детали события',
        active: currentPath === basePath,
      },
      {
        href: `${basePath}/chat`,
        label: 'Чат',
        active: currentPath.startsWith(`${basePath}/chat`),
      },
      {
        href: `${basePath}/polls`,
        label: 'Опросы',
        active: currentPath.startsWith(`${basePath}/polls`),
      },
    ];
  }, [basePath, pathname]);

  const containerClassName = [
    'w-full',
    'shrink-0',
    'flex',
    'flex-col',
    'h-full',
    'lg:w-64',
    'lg:sticky',
    'lg:top-24',
    'lg:self-stretch',
    'lg:order-last',
    'lg:ml-6',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={containerClassName}>
      <nav
        aria-label="Навигация по разделам события"
        className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p className="hidden px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 lg:block">
          Разделы события
        </p>
        <ul className="flex w-full gap-2 overflow-x-auto px-3 pb-3 pt-2 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-4 lg:py-3">
          {links.map((link) => (
            <li key={link.href} className="lg:w-full">
              <Link
                href={link.href}
                className={`inline-flex min-w-[140px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition lg:min-w-0 lg:w-full lg:justify-start ${
                  link.active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
                aria-current={link.active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default EventNavigation;

