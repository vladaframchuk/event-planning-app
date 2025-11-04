'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type JSX, ChangeEvent, FormEvent, useMemo, useState } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';
import { login } from '@/lib/authClient';
import { t } from '@/lib/i18n';

type LoginFormValues = {
  email: string;
  password: string;
};

type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>> & {
  general?: string;
};

const initialValues: LoginFormValues = {
  email: '',
  password: '',
};

const fieldClassName =
  'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';

const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';
const errorMessageClassName = 'text-xs text-[var(--color-error)]';

const dispatchAuthEvent = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT_NAME));
};

const validate = (values: LoginFormValues): LoginFormErrors => {
  const validationErrors: LoginFormErrors = {};

  if (!values.email.trim()) {
    validationErrors.email = t('auth.login.field.email.error.required');
  }

  if (!values.password) {
    validationErrors.password = t('auth.login.field.password.error.required');
  }

  return validationErrors;
};

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const [values, setValues] = useState<LoginFormValues>(initialValues);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasFieldError = (field: keyof LoginFormValues): boolean => Boolean(errors[field]);
  const isSubmitDisabled = useMemo(
    () => isSubmitting || values.email.trim().length === 0 || values.password.trim().length === 0,
    [isSubmitting, values.email, values.password],
  );

  const handleChange =
    (field: keyof LoginFormValues) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      setValues((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const validationErrors = validate(values);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await login(values.email.trim(), values.password);
      dispatchAuthEvent();
      if (typeof window !== 'undefined') {
        const pendingToken = window.localStorage.getItem('epa_pending_invite_token');
        if (pendingToken) {
          window.localStorage.removeItem('epa_pending_invite_token');
          router.push(`/join?token=${encodeURIComponent(pendingToken)}`);
          return;
        }
      }
      router.push('/events');
    } catch {
      const message = t('auth.login.error.generic');
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center justify-center px-4 py-16 sm:px-8 lg:px-12">
      <div className="w-full max-w-[480px] rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 shadow-[var(--shadow-md)] sm:px-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
            {t('auth.login.title')}
          </h1>
          <p className="text-base text-[var(--color-text-secondary)]">{t('auth.login.subtitle')}</p>
        </header>

        {errors.general ? (
          <div
            className="mt-6 rounded-[20px] border border-[var(--color-error-soft)] bg-[var(--color-error-soft)]/40 px-5 py-4 text-sm text-[var(--color-error)] shadow-sm"
            role="alert"
          >
            {errors.general}
          </div>
        ) : null}

        <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <label className={labelClassName} htmlFor="login-email">
              {t('auth.login.field.email.label')}
            </label>
            <input
              id="login-email"
              type="email"
              value={values.email}
              onChange={handleChange('email')}
              aria-label={t('auth.login.aria.email')}
              aria-required="true"
              aria-invalid={hasFieldError('email')}
              aria-describedby={hasFieldError('email') ? 'login-email-error' : undefined}
              className={fieldClassName}
              placeholder={t('auth.login.field.email.placeholder')}
              autoComplete="email"
              required
            />
            {errors.email ? (
              <span className={errorMessageClassName} id="login-email-error">
                {errors.email}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClassName} htmlFor="login-password">
              {t('auth.login.field.password.label')}
            </label>
            <input
              id="login-password"
              type="password"
              value={values.password}
              onChange={handleChange('password')}
              aria-label={t('auth.login.aria.password')}
              aria-required="true"
              aria-invalid={hasFieldError('password')}
              aria-describedby={hasFieldError('password') ? 'login-password-error' : undefined}
              className={fieldClassName}
              placeholder={t('auth.login.field.password.placeholder')}
              autoComplete="current-password"
              required
            />
            {errors.password ? (
              <span className={errorMessageClassName} id="login-password-error">
                {errors.password}
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--pill w-full justify-center"
            aria-label={t('auth.login.aria.submit')}
            disabled={isSubmitDisabled}
          >
            {isSubmitting ? t('auth.login.submit.loading') : t('auth.login.submit')}
          </button>
        </form>

        <p className="mt-8 text-sm text-[var(--color-text-secondary)]">
          {t('auth.login.link.text')}{' '}
          <Link href="/signup" className="font-semibold text-[var(--color-accent-primary)] underline-offset-4 hover:underline">
            {t('auth.login.link.action')}
          </Link>
        </p>
      </div>
    </section>
  );
};

export default LoginPage;
