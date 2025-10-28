'use client';

import { useState, type FormEvent, type JSX } from 'react';

import { changePassword } from '@/lib/profileApi';

type NotificationType = 'success' | 'error';

type ProfileSecurityFormProps = {
  onNotify: (type: NotificationType, message: string) => void;
};

const ProfileSecurityForm = ({ onNotify }: ProfileSecurityFormProps): JSX.Element => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (newPassword.trim().length === 0 || oldPassword.trim().length === 0) {
      onNotify('error', 'Ошибка: заполните оба поля пароля.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword('');
      setNewPassword('');
      onNotify('success', 'Сохранено');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сменить пароль.';
      onNotify('error', `Ошибка: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Безопасность</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Задайте новый пароль для своего аккаунта. Старайтесь использовать надёжные комбинации из букв и цифр.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          Текущий пароль
          <input
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
          Новый пароль
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Сохраняем...' : 'Сменить пароль'}
      </button>
    </form>
  );
};

export default ProfileSecurityForm;
