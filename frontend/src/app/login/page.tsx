'use client';

import { type JSX, ChangeEvent, FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { login } from '@/lib/authClient';

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

const validate = (values: LoginFormValues): LoginFormErrors => {
  const validationErrors: LoginFormErrors = {};

  if (!values.email.trim()) {
    validationErrors.email = 'Введите email.';
  }

  if (!values.password) {
    validationErrors.password = 'Введите пароль.';
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
      router.push('/events');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось выполнить вход. Попробуйте позже.';
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mx-auto flex max-w-md flex-col gap-6 rounded-lg border border-neutral-200 p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-neutral-900">Вход</h1>
      <p className="text-neutral-700">
        Введите свои данные, чтобы продолжить работу с приложением.
      </p>

      {errors.general ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {errors.general}
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-800" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={values.email}
            onChange={handleChange('email')}
            aria-label="Email"
            aria-required="true"
            aria-invalid={hasFieldError('email')}
            aria-describedby={hasFieldError('email') ? 'login-email-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="name@example.com"
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
          <label className="text-sm font-medium text-neutral-800" htmlFor="login-password">
            Пароль
          </label>
          <input
            id="login-password"
            type="password"
            value={values.password}
            onChange={handleChange('password')}
            aria-label="Пароль"
            aria-required="true"
            aria-invalid={hasFieldError('password')}
            aria-describedby={hasFieldError('password') ? 'login-password-error' : undefined}
            className="rounded-md border border-neutral-300 p-2 text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Ваш пароль"
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
          aria-label="Отправить форму входа"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Выполняем вход...' : 'Войти'}
        </button>
      </form>

      <p className="text-sm text-neutral-600">
        Нет аккаунта?{' '}
        <Link href="/signup" className="text-blue-600 underline underline-offset-4">
          Зарегистрируйтесь
        </Link>
      </p>
    </section>
  );
};

export default LoginPage;
