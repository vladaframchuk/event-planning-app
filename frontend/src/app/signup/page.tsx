'use client';

import { type JSX, ChangeEvent, FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';

import { apiFetch } from '@/lib/fetcher';

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

const validate = (values: SignupFormValues): SignupFormErrors => {
  const validationErrors: SignupFormErrors = {};

  if (!values.email.trim()) {
    validationErrors.email = 'Укажите email.';
  }

  if (!passwordRule.test(values.password)) {
    validationErrors.password = 'Пароль должен содержать минимум 8 символов, букву и цифру.';
  }

  return validationErrors;
};

const formatName = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const SignupPage = (): JSX.Element => {
  const [values, setValues] = useState<SignupFormValues>(initialValues);
  const [errors, setErrors] = useState<SignupFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const hasFieldError = (field: keyof SignupFormValues): boolean => Boolean(errors[field]);

  const passwordHint = useMemo(
    () => 'Минимум 8 символов, хотя бы одна буква и одна цифра.',
    [],
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
        error instanceof Error ? error.message : 'Не удалось отправить данные. Попробуйте позже.';
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <section className="mx-auto flex max-w-md flex-col gap-6 rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Проверьте почту</h1>
        <p className="text-neutral-700">
          Мы отправили письмо для подтверждения регистрации. Перейдите по ссылке в письме, чтобы
          активировать аккаунт.
        </p>
        <p className="text-sm text-neutral-600">
          Не получили письмо? Проверьте папку «Спам» или повторите регистрацию чуть позже.
        </p>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-blue-600 underline underline-offset-4"
        >
          Перейти ко входу
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 rounded-lg border border-neutral-200 p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-neutral-900">Регистрация</h1>
      <p className="text-neutral-700">
        Заполните форму, чтобы создать аккаунт и планировать события вместе с нами.
      </p>

      {errors.general ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {errors.general}
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={values.email}
            onChange={handleChange('email')}
            aria-label="Email"
            aria-required="true"
            aria-invalid={hasFieldError('email')}
            aria-describedby={hasFieldError('email') ? 'signup-email-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="name@example.com"
            autoComplete="email"
            required
          />
          {errors.email ? (
            <span className="text-xs text-red-600" id="signup-email-error">
              {errors.email}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="signup-password">
            Пароль
          </label>
          <input
            id="signup-password"
            type="password"
            value={values.password}
            onChange={handleChange('password')}
            aria-label="Пароль"
            aria-required="true"
            aria-invalid={hasFieldError('password')}
            aria-describedby={hasFieldError('password') ? 'signup-password-error' : 'signup-password-hint'}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Надёжный пароль"
            autoComplete="new-password"
            required
          />
          <span className="text-xs text-neutral-500" id="signup-password-hint">
            {passwordHint}
          </span>
          {errors.password ? (
            <span className="text-xs text-red-600" id="signup-password-error">
              {errors.password}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="signup-name">
            Имя (необязательно)
          </label>
          <input
            id="signup-name"
            type="text"
            value={values.name}
            onChange={handleChange('name')}
            aria-label="Имя"
            aria-invalid={hasFieldError('name')}
            aria-describedby={hasFieldError('name') ? 'signup-name-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Как к вам обращаться"
            autoComplete="name"
          />
          {errors.name ? (
            <span className="text-xs text-red-600" id="signup-name-error">
              {errors.name}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          aria-label="Отправить форму регистрации"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Отправляем...' : 'Создать аккаунт'}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        Уже зарегистрированы?{' '}
        <Link href="/login" className="text-blue-600 underline underline-offset-4">
          Перейдите ко входу
        </Link>
      </p>
    </section>
  );
};

export default SignupPage;
