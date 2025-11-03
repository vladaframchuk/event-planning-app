'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type JSX, ChangeEvent, FormEvent, useState } from 'react';

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
    <section className="mx-auto flex max-w-md flex-col gap-6 rounded-lg border border-neutral-200 p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-neutral-900">{t('auth.login.title')}</h1>
      <p className="text-neutral-700">{t('auth.login.subtitle')}</p>

      {errors.general ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {errors.general}
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="login-email">{t('auth.login.field.email.label')}</label>
          <input
            id="login-email"
            type="email"
            value={values.email}
            onChange={handleChange('email')}
            aria-label={t('auth.login.aria.email')}
            aria-required="true"
            aria-invalid={hasFieldError('email')}
            aria-describedby={hasFieldError('email') ? 'login-email-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={t('auth.login.field.email.placeholder')}
            autoComplete="email"
            required
          />
          {errors.email ? (
            <span className="text-xs text-red-600" id="login-email-error">
              {errors.email}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="login-password">{t('auth.login.field.password.label')}</label>
          <input
            id="login-password"
            type="password"
            value={values.password}
            onChange={handleChange('password')}
            aria-label={t('auth.login.aria.password')}
            aria-required="true"
            aria-invalid={hasFieldError('password')}
            aria-describedby={hasFieldError('password') ? 'login-password-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={t('auth.login.field.password.placeholder')}
            autoComplete="current-password"
            required
          />
          {errors.password ? (
            <span className="text-xs text-red-600" id="login-password-error">
              {errors.password}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          aria-label={t('auth.login.aria.submit')}
          disabled={isSubmitting}
        >
          {isSubmitting ? t('auth.login.submit.loading') : t('auth.login.submit')}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        {t('auth.login.link.text')} {' '}
        <Link href="/signup" className="text-blue-600 underline underline-offset-4">
          {t('auth.login.link.action')}
        </Link>
      </p>
    </section>
  );
};

export default LoginPage;
