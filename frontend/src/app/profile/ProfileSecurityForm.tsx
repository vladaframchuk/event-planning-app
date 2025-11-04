'use client';

import { useState, type FormEvent, type JSX } from 'react';

import { t } from '@/lib/i18n';
import { changePassword } from '@/lib/profileApi';

type NotificationType = 'success' | 'error';

type ProfileSecurityFormProps = {
  onNotify: (type: NotificationType, message: string) => void;
};

const ProfileSecurityForm = ({ onNotify }: ProfileSecurityFormProps): JSX.Element => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fieldClassName =
    'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';
  const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';
  const cardClassName =
    'flex flex-col gap-4 rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-sm sm:px-8 sm:py-8';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (newPassword.trim().length === 0 || oldPassword.trim().length === 0) {
      onNotify('error', t('profile.security.error.empty'));
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
      onNotify('success', t('profile.security.success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('profile.security.error.generic');
      onNotify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <header>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('profile.security.title')}</h2>
      </header>

      <section className={cardClassName}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={`${labelClassName} flex flex-col gap-2`}>
            {t('profile.security.field.current')}
            <input
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              className={fieldClassName}
            />
          </label>

          <label className={`${labelClassName} flex flex-col gap-2`}>
            {t('profile.security.field.new')}
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className={fieldClassName}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn btn--primary btn--pill" disabled={isSubmitting}>
            {isSubmitting ? t('profile.security.submit.loading') : t('profile.security.submit')}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--pill"
            onClick={() => {
              setOldPassword('');
              setNewPassword('');
            }}
            disabled={isSubmitting}
          >
            {t('profile.security.reset')}
          </button>
        </div>
      </section>
    </form>
  );
};

export default ProfileSecurityForm;
