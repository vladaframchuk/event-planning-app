import { type JSX } from 'react';

import { t } from '@/lib/i18n';

const paddingStyle = {
  paddingBottom: 'calc(var(--safe-bottom) + var(--space-md))',
  paddingTop: 'var(--space-lg)',
} as const;

const backendBaseUrl =
  process.env['NEXT_PUBLIC_BACKEND_URL']?.replace(/\/+$/, '') ?? 'http://localhost:8000';

const docsUrl = process.env['NEXT_PUBLIC_DOCS_URL'] ?? `${backendBaseUrl}/doc/`;

const SiteFooter = (): JSX.Element => (
  <footer
    role="contentinfo"
    className="w-full border-t border-[color:var(--color-border-subtle)] bg-[color:rgba(255,255,255,0.82)]/90 backdrop-blur supports-[backdrop-filter]:bg-[color:rgba(255,255,255,0.72)]"
    style={paddingStyle}
  >
    <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <p className="text-sm text-[color:var(--color-text-muted)]">{t('landing.footer.caption')}</p>
      <nav
        aria-label={t('landing.footer.navAria')}
        className="flex items-center gap-4 text-sm font-medium"
      >
        <a
          href={docsUrl}
          className="inline-flex min-h-[48px] items-center text-[color:var(--color-accent-primary)] transition hover:text-[color:var(--color-accent-primary-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-primary)]"
        >
          {t('landing.footer.docs')}
        </a>
      </nav>
    </div>
  </footer>
);

export default SiteFooter;
