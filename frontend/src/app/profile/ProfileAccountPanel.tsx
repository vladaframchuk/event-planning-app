'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type JSX } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';
import { logout } from '@/lib/authClient';
import { requestEmailChange } from '@/lib/profileApi';

type NotificationType = 'success' | 'error';

type ProfileAccountPanelProps = {
  email: string;
  onNotify: (type: NotificationType, message: string) => void;
};

const dispatchAuthEvent = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT_NAME));
};

const ProfileAccountPanel = ({ email, onNotify }: ProfileAccountPanelProps): JSX.Element => {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleRequestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmed = newEmail.trim();
    if (trimmed.length === 0) {
      onNotify('error', 'Ошибка: укажите новый e-mail.');
      return;
    }
    if (trimmed.toLowerCase() === email.toLowerCase()) {
      onNotify('error', 'Ошибка: новый e-mail совпадает с текущим.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestEmailChange({ new_email: trimmed });
      onNotify('success', 'Сохранено');
      setNewEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить письмо.';
      onNotify('error', `Ошибка: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    logout();
    dispatchAuthEvent();
    router.replace('/login');
  };

  return (
    <section className="space-y-6" aria-labelledby="profile-account-heading">
      <div>
        <h2 id="profile-account-heading" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Аккаунт
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Управляйте основными параметрами входа: текущий адрес электронной почты и выход из аккаунта.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Текущий e-mail</p>
          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{email}</p>
        </div>

        <form className="space-y-3" onSubmit={handleRequestEmailChange}>
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Новый e-mail
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="new@example.com"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправляем...' : 'Отправить письмо для смены email'}
          </button>
        </form>

        <div className="border-t border-dashed border-neutral-200 pt-4 dark:border-neutral-700">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleSwitchAccount}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Переключаем...' : 'Сменить аккаунт'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProfileAccountPanel;
