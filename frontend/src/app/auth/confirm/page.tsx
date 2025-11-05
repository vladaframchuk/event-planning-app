'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type FormEvent, type JSX } from 'react';

import { confirmRegistration, resendConfirmationEmail } from '@/lib/authApi';
import { t } from '@/lib/i18n';

type Status = 'idle' | 'loading' | 'success' | 'error';

type ConfirmState = {
  status: Status;
  message: string;
};

const cardClassName =
  'rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 shadow-[var(--shadow-md)] sm:px-10';
const fieldClassName =
  'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';
const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';

const ConfirmContent = (): JSX.Element => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<ConfirmState>({ status: 'idle', message: '' });
  const [isResending, setIsResending] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: t('auth.confirm.error.missingToken') });
      return;
    }

    let cancelled = false;

    const run = async () => {
      setState({ status: 'loading', message: t('auth.confirm.loading') });
      try {
        const response = await confirmRegistration(token);
        if (!cancelled) {
          setState({ status: 'success', message: response.message });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : t('auth.confirm.error.generic');
          setState({ status: 'error', message });
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const statusContent = useMemo(() => {
    switch (state.status) {
      case 'loading':
        return (
          <p className="text-base text-[var(--color-text-secondary)]">
            {state.message}
          </p>
        );
      case 'success':
        return (
          <div className="flex flex-col gap-4 text-base text-[var(--color-text-secondary)]">
            <p>{state.message}</p>
            <p>{t('auth.confirm.success.description')}</p>
            <Link href="/login" className="btn btn--primary btn--pill w-full justify-center md:w-auto">
              {t('auth.confirm.success.cta')}
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
  }, [state]);

  const handleResend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isResending) {
      return;
    }

    const trimmed = resendEmail.trim();
    if (!trimmed) {
      setResendMessage(t('auth.confirm.resend.error.required'));
      return;
    }

    setIsResending(true);
    setResendMessage(null);

    try {
      const response = await resendConfirmationEmail(trimmed);
      setResendMessage(response.message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('auth.confirm.resend.error.generic');
      setResendMessage(message);
    } finally {
      setIsResending(false);
    }
  };

  const showResend = state.status !== 'success';

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col gap-6 px-4 py-16 sm:px-8 lg:px-12">
      <div className={cardClassName}>
        <header className="flex flex-col gap-4">
          <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
            {t('auth.confirm.title')}
          </h1>
          <p className="text-base text-[var(--color-text-secondary)]">{t('auth.confirm.subtitle')}</p>
        </header>
        <div className="mt-6">{statusContent}</div>
      </div>

      {showResend ? (
        <div className={cardClassName}>
          <header className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              {t('auth.confirm.resend.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">{t('auth.confirm.resend.description')}</p>
          </header>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleResend} noValidate>
            <div className="flex flex-col gap-2">
              <label className={labelClassName} htmlFor="resend-email">
                {t('auth.confirm.resend.field.email.label')}
              </label>
              <input
                id="resend-email"
                type="email"
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
                className={fieldClassName}
                placeholder={t('auth.confirm.resend.field.email.placeholder')}
                autoComplete="email"
              />
            </div>
            <button
              type="submit"
              disabled={isResending}
              className="btn btn--primary btn--pill w-full justify-center md:w-auto"
            >
              {isResending ? t('auth.confirm.resend.submit.loading') : t('auth.confirm.resend.submit')}
            </button>
          </form>
          {resendMessage ? (
            <p className="mt-4 text-sm text-[var(--color-text-secondary)]">{resendMessage}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

const ConfirmFallback = (): JSX.Element => (
  <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col gap-6 px-4 py-16 sm:px-8 lg:px-12">
    <div className={cardClassName}>
      <header className="flex flex-col gap-4">
        <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
          {t('auth.confirm.title')}
        </h1>
        <p className="text-base text-[var(--color-text-secondary)]">{t('auth.confirm.subtitle')}</p>
      </header>
      <div className="mt-6">
        <p className="text-base text-[var(--color-text-secondary)]">{t('auth.confirm.loading')}</p>
      </div>
    </div>

    <div className={cardClassName}>
      <header className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {t('auth.confirm.resend.title')}
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('auth.confirm.resend.description')}</p>
      </header>

      <div className="mt-6 flex flex-col gap-4">
        <div className="h-[52px] w-full rounded-[20px] bg-[var(--color-surface-muted)]" />
        <div className="h-12 w-full rounded-full bg-[var(--color-surface-muted)] sm:w-48" />
      </div>
    </div>
  </section>
);

const ConfirmPage = (): JSX.Element => (
  <Suspense fallback={<ConfirmFallback />}>
    <ConfirmContent />
  </Suspense>
);

export default ConfirmPage;
