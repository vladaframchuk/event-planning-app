'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type JSX } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';
import { logout } from '@/lib/authClient';
import { t } from '@/lib/i18n';
import { requestEmailChange, updateEmailNotifications } from '@/lib/profileApi';

type NotificationType = 'success' | 'error';

type ProfileAccountPanelProps = {
  email: string;
  emailNotificationsEnabled: boolean;
  onNotify: (type: NotificationType, message: string) => void;
  onEmailNotificationsChange: (value: boolean) => void;
};

const dispatchAuthEvent = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT_NAME));
};

const ProfileAccountPanel = ({
  email,
  emailNotificationsEnabled,
  onNotify,
  onEmailNotificationsChange,
}: ProfileAccountPanelProps): JSX.Element => {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(emailNotificationsEnabled);
  const [emailChangeStatus, setEmailChangeStatus] = useState<string | null>(null);

  const fieldClassName =
    'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';
  const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';
  const cardClassName =
    'flex flex-col gap-4 rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-sm sm:px-8 sm:py-8';
  const accountSubtitle = t('profile.account.subtitle').trim();
  const notificationsDescription = t('profile.account.notifications.description').trim();

  useEffect(() => {
    setNotificationsEnabled(emailNotificationsEnabled);
  }, [emailNotificationsEnabled]);

  const handleToggleNotifications = async () => {
    if (isUpdatingNotifications) {
      return;
    }

    const nextValue = !notificationsEnabled;
    setIsUpdatingNotifications(true);
    try {
      const response = await updateEmailNotifications({ email_notifications_enabled: nextValue });
      setNotificationsEnabled(response.email_notifications_enabled);
      onEmailNotificationsChange(response.email_notifications_enabled);
      onNotify(
        'success',
        response.email_notifications_enabled
          ? t('profile.account.notifications.enabled')
          : t('profile.account.notifications.disabled'),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('profile.account.notifications.error');
      onNotify('error', message);
    } finally {
      setIsUpdatingNotifications(false);
    }
  };

  const handleRequestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const trimmed = newEmail.trim();
    if (trimmed.length === 0) {
      onNotify('error', t('profile.account.emailChange.error.empty'));
      return;
    }
    if (trimmed.toLowerCase() === email.toLowerCase()) {
      onNotify('error', t('profile.account.emailChange.error.same'));
      return;
    }

    setIsSubmitting(true);
    setEmailChangeStatus(null);
    try {
      await requestEmailChange({ new_email: trimmed });
      setEmailChangeStatus(t('profile.account.emailChange.status', { email: trimmed }));
      onNotify('success', t('profile.account.emailChange.success'));
      setNewEmail('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('profile.account.emailChange.errorGeneric');
      onNotify('error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSwitchAccount = () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    logout();
    dispatchAuthEvent();
    router.replace('/login');
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="profile-account-heading">
      <header>
        <h2 id="profile-account-heading" className="text-lg font-semibold text-[var(--color-text-primary)]">
          {t('profile.account.title')}
        </h2>
        {accountSubtitle.length > 0 ? (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{accountSubtitle}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-6">
        <section className={cardClassName}>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('profile.account.currentEmail')}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{email}</p>
          </div>

          <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-primary)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t('profile.account.notifications.title')}
              </p>
              {notificationsDescription.length > 0 ? (
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{notificationsDescription}</p>
              ) : null}
            </div>
            <button
              aria-label={t('profile.account.notifications.toggleAria')}
              type="button"
              onClick={handleToggleNotifications}
              disabled={isUpdatingNotifications}
              className={[
                'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                notificationsEnabled
                  ? 'bg-[var(--color-accent-primary)]'
                  : 'bg-[var(--color-border-subtle)]',
                isUpdatingNotifications ? 'opacity-70' : '',
              ].join(' ')}
              aria-pressed={notificationsEnabled}
            >
              <span
                className={[
                  'inline-block h-6 w-6 rounded-full bg-[var(--color-background-elevated)] shadow-sm transition-transform duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-1',
                ].join(' ')}
              />
            </button>
          </div>
        </section>

        <section className={cardClassName}>
          <form className="flex flex-col gap-4" onSubmit={handleRequestEmailChange} noValidate>
            <label className={`${labelClassName} flex flex-col gap-2`}>
              {t('profile.account.field.newEmail')}
              <input
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder={t('profile.account.field.newEmail.placeholder')}
                className={fieldClassName}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn--primary btn--pill" disabled={isSubmitting}>
                {isSubmitting ? t('profile.account.action.sendConfirmation.loading') : t('profile.account.action.sendConfirmation')}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--pill"
                onClick={() => setNewEmail('')}
                disabled={isSubmitting}
              >
                {t('profile.account.action.clear')}
              </button>
            </div>
          </form>
          {emailChangeStatus ? (
            <p className="text-sm text-[var(--color-text-secondary)]">{emailChangeStatus}</p>
          ) : null}
        </section>

        <section className={cardClassName}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {t('profile.account.switch.heading')}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {t('profile.account.switch.description')}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--pill"
              onClick={handleSwitchAccount}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? t('profile.account.switch.loading') : t('profile.account.switch.label')}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
};

export default ProfileAccountPanel;
