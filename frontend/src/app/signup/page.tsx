'use client';

import Link from 'next/link';
import { type JSX, ChangeEvent, FormEvent, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/fetcher';
import { t } from '@/lib/i18n';

type SignupFormValues = {
  email: string;
  password: string;
  name: string;
};

type SignupFormErrors = Partial<Record<keyof SignupFormValues, string>> & {
  general?: string;
};

const initialValues: SignupFormValues = {
  email: '',
  password: '',
  name: '',
};

const passwordRule = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const fieldClassName =
  'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';
const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';
const errorMessageClassName = 'text-xs text-[var(--color-error)]';

const formatName = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const validate = (values: SignupFormValues): SignupFormErrors => {
  const validationErrors: SignupFormErrors = {};

  if (!values.email.trim()) {
    validationErrors.email = t('auth.signup.field.email.error.required');
  }

  if (!passwordRule.test(values.password)) {
    validationErrors.password = t('auth.signup.field.password.error.invalid');
  }

  return validationErrors;
};

const SignupPage = (): JSX.Element => {
  const [values, setValues] = useState<SignupFormValues>(initialValues);
  const [errors, setErrors] = useState<SignupFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const hasFieldError = (field: keyof SignupFormValues): boolean => Boolean(errors[field]);
  const isSubmitDisabled = useMemo(
    () => isSubmitting || values.email.trim().length === 0 || values.password.trim().length === 0,
    [isSubmitting, values.email, values.password],
  );

  const handleChange =
    (field: keyof SignupFormValues) =>
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
      await apiFetch<{ message: string }>('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: values.email.trim(),
          password: values.password,
          name: formatName(values.name),
        }),
        skipAuth: true,
      });

      setIsSuccess(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('auth.signup.error.generic');
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center justify-center px-4 py-16 sm:px-8 lg:px-12">
        <div className="w-full max-w-[480px] rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-md)] sm:px-10">
          <header className="flex flex-col gap-4">
            <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
              {t('auth.signup.success.title')}
            </h1>
            <p className="text-base">{t('auth.signup.success.description')}</p>
            <p>{t('auth.signup.success.hint')}</p>
          </header>
          <Link href="/login" className="btn btn--primary btn--pill mt-8 w-full justify-center">
            {t('auth.signup.success.cta')}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl items-center justify-center px-4 py-16 sm:px-8 lg:px-12">
      <div className="w-full max-w-[520px] rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 shadow-[var(--shadow-md)] sm:px-10">
        <header className="flex flex-col gap-4">
          <h1 className="text-[clamp(1.8rem,3vw,2.4rem)] font-semibold text-[var(--color-text-primary)]">
            {t('auth.signup.title')}
          </h1>
          <p className="text-base text-[var(--color-text-secondary)]">{t('auth.signup.subtitle')}</p>
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
            <label className={labelClassName} htmlFor="signup-email">
              {t('auth.signup.field.email.label')}
            </label>
            <input
              id="signup-email"
              type="email"
              value={values.email}
              onChange={handleChange('email')}
              aria-label={t('auth.signup.aria.email')}
              aria-required="true"
              aria-invalid={hasFieldError('email')}
              aria-describedby={hasFieldError('email') ? 'signup-email-error' : undefined}
              className={fieldClassName}
              placeholder={t('auth.signup.field.email.placeholder')}
              autoComplete="email"
              required
            />
            {errors.email ? (
              <span className={errorMessageClassName} id="signup-email-error">
                {errors.email}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClassName} htmlFor="signup-password">
              {t('auth.signup.field.password.label')}
            </label>
            <input
              id="signup-password"
              type="password"
              value={values.password}
              onChange={handleChange('password')}
              aria-label={t('auth.signup.aria.password')}
              aria-required="true"
              aria-invalid={hasFieldError('password')}
              aria-describedby={hasFieldError('password') ? 'signup-password-error' : 'signup-password-hint'}
              className={fieldClassName}
              placeholder={t('auth.signup.field.password.placeholder')}
              autoComplete="new-password"
              required
            />
            <span className="text-xs text-[var(--color-text-muted)]" id="signup-password-hint">
              {t('auth.signup.passwordHint')}
            </span>
            {errors.password ? (
              <span className={errorMessageClassName} id="signup-password-error">
                {errors.password}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClassName} htmlFor="signup-name">
              {t('auth.signup.field.name.label')}
            </label>
            <input
              id="signup-name"
              type="text"
              value={values.name}
              onChange={handleChange('name')}
              aria-label={t('auth.signup.aria.name')}
              className={fieldClassName}
              placeholder={t('auth.signup.field.name.placeholder')}
              autoComplete="name"
            />
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--pill w-full justify-center"
            aria-label={t('auth.signup.aria.submit')}
            disabled={isSubmitDisabled}
          >
            {isSubmitting ? t('auth.signup.submit.loading') : t('auth.signup.submit')}
          </button>
        </form>

        <p className="mt-8 text-sm text-[var(--color-text-secondary)]">
          {t('auth.signup.link.text')}{' '}
          <Link href="/login" className="font-semibold text-[var(--color-accent-primary)] underline-offset-4 hover:underline">
            {t('auth.signup.link.action')}
          </Link>
        </p>
      </div>
    </section>
  );
};

export default SignupPage;
