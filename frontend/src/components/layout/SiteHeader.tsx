'use client';

import Link from 'next/link';
import { type ComponentPropsWithoutRef, type JSX, useMemo } from 'react';

import { useAuthStatus } from '@/hooks/useAuthStatus';
import { t } from '@/lib/i18n';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

const navLinkBase =
  'inline-flex min-h-[48px] items-center rounded-full px-4 text-sm font-semibold leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const ghostLinkClasses =
  `${navLinkBase} text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-strong)] focus-visible:outline-[var(--color-accent-primary)]`;

const primaryLinkClasses =
  `${navLinkBase} bg-[var(--button-primary-bg)] text-white hover:text-white focus-visible:text-white shadow-[var(--button-shadow)] hover:bg-[var(--button-primary-bg-hover)] focus-visible:outline-[var(--button-focus-ring)]`;

const primaryLinkStyle: LinkProps['style'] = { color: '#ffffff' };

const mutedLinkClasses =
  `${navLinkBase} bg-[var(--color-background-subtle)] text-[var(--color-accent-primary)] hover:text-[var(--color-accent-primary-strong)] focus-visible:outline-[var(--color-accent-primary)]`;

const headerWrapperStyle = {
  paddingTop: 'calc(var(--safe-top) + var(--space-sm))',
  paddingBottom: 'var(--space-sm)',
} as const;

const headerInnerStyle = {
  minHeight: 'var(--header-height)',
} as const;

const buildLinkSet = (status: 'authenticated' | 'guest'): LinkProps[] => {
  if (status === 'authenticated') {
    return [
      {
        href: '/events',
        children: t('landing.header.events'),
        className: mutedLinkClasses,
      },
      {
        href: '/profile',
        children: t('landing.header.profile'),
        className: primaryLinkClasses,
        style: primaryLinkStyle,
      },
    ];
  }

  return [
    {
      href: '/login',
      children: t('landing.header.login'),
      className: ghostLinkClasses,
    },
    {
      href: '/signup',
      children: t('landing.header.signup'),
      className: primaryLinkClasses,
      style: primaryLinkStyle,
    },
  ];
};

const SiteHeader = (): JSX.Element => {
  const status = useAuthStatus();

  const links = useMemo(() => {
    if (status === 'unknown') {
      return buildLinkSet('guest');
    }
    return buildLinkSet(status);
  }, [status]);

  const navVisibilityClass = status === 'unknown' ? 'invisible' : '';

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 w-full border-b border-[color:var(--color-border-subtle)] bg-[color:var(--color-background-elevated)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--color-background-elevated)]/80"
      style={headerWrapperStyle}
    >
      <div
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        style={headerInnerStyle}
      >
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center rounded-full px-3 text-base font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)] transition hover:text-[color:var(--color-accent-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]"
        >
          {t('landing.header.brand')}
        </Link>
        <nav
          aria-label={t('landing.header.navAria')}
          className={`flex items-center gap-2 sm:gap-3 ${navVisibilityClass}`}
          aria-hidden={status === 'unknown'}
        >
          {links.map((link, index) => {
            const linkKey =
              typeof link.href === 'string' ? link.href : link.href.pathname ?? JSON.stringify(link.href);
            return <Link key={linkKey ?? `nav-link-${index}`} {...link} />;
          })}
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;
