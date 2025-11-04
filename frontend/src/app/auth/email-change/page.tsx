'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type JSX } from 'react';

import { confirmEmailChange } from '@/lib/authApi';
import { t } from '@/lib/i18n';

type Status = 'idle' | 'loading' | 'success' | 'error';

type ViewState = {
  status: Status;
  message: string;
};

const cardClassName =
  'rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 shadow-[var(--shadow-md)] sm:px-10';

const EmailChangeContent = (): JSX.Element => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ViewState>({ status: 'idle', message: '' });

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: t('auth.emailChange.error.missingToken') });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState({ status: 'loading', message: t('auth.emailChange.loading') });
      try {
        const response = await confirmEmailChange(token);
        if (!cancelled) {
          setState({ status: 'success', message: response.detail });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : t('auth.emailChange.error.generic');
          setState({ status: 'error', message });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const statusContent = (() => {
    switch (state.status) {
      case 'loading':
        return <p className="text-base text-[var(--color-text-secondary)]">{state.message}</p>;
      case 'success':
        return (
          <div className="flex flex-col gap-4 text-base text-[var(--color-text-secondary)]">
            <p>{state.message}</p>
            <p>{t('auth.emailChange.success.description')}</p>
            <Link href="/login" className="btn btn--primary btn--pill w-full justify-center sm:w-auto">
              {t('auth.emailChange.success.cta')}
            </Link>
          </div>
        );
      case 'error':
        return (
          <div className="rounded-[20px] border border-[var(--color-error-soft)] bg-[var(--color-error-soft)]/40 px-5 py-4 text-sm text-[var(--color-error)]">
            {state.message}
          </div>
        );
      default:
        return null;
    }
  })();

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-3xl flex-col justify-center gap-6 px-4 py-16 sm:px-8 lg:px-12">
      <div className={cardClassName}>
        <header className="flex flex-col gap-4">
          <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
            {t('auth.emailChange.title')}
          </h1>
          <p className="text-base text-[var(--color-text-secondary)]">{t('auth.emailChange.subtitle')}</p>
        </header>
        <div className="mt-6">{statusContent}</div>
      </div>
    </section>
  );
};

const EmailChangeFallback = (): JSX.Element => (
  <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-3xl flex-col justify-center gap-6 px-4 py-16 sm:px-8 lg:px-12">
    <div className={cardClassName}>
      <header className="flex flex-col gap-4">
        <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
          {t('auth.emailChange.title')}
        </h1>
        <p className="text-base text-[var(--color-text-secondary)]">{t('auth.emailChange.subtitle')}</p>
      </header>
      <div className="mt-6">
        <p className="text-base text-[var(--color-text-secondary)]">{t('auth.emailChange.loading')}</p>
      </div>
    </div>
  </section>
);

const EmailChangeConfirmPage = (): JSX.Element => (
  <Suspense fallback={<EmailChangeFallback />}>
    <EmailChangeContent />
  </Suspense>
);

export default EmailChangeConfirmPage;
