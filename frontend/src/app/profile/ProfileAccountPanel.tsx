'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type JSX } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';
import { logout } from '@/lib/authClient';
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
        response.email_notifications_enabled ? 'Email reminders enabled.' : 'Email reminders disabled.',
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update email notification settings.';
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
      onNotify('error', 'Enter a new email address.');
      return;
    }
    if (trimmed.toLowerCase() === email.toLowerCase()) {
      onNotify('error', 'New email must be different from the current one.');
      return;
    }

    setIsSubmitting(true);
    setEmailChangeStatus(null);
    try {
      await requestEmailChange({ new_email: trimmed });
      setEmailChangeStatus(`Confirmation email sent to ${trimmed}. Please check your inbox.`);
      onNotify('success', 'We sent a confirmation link to your new email.');
      setNewEmail('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong while requesting email change.';
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
    <section className="space-y-6" aria-labelledby="profile-account-heading">
      <div>
        <h2 id="profile-account-heading" className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Account
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Manage the primary email and email notification preferences.
        </p>
      </div>

      <div className="space-y-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Current email</p>
          <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100">{email}</p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-700">
          <div>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Receive reminders by email
            </p>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              When enabled, task reminders and poll summaries will be delivered to your inbox.
            </p>
          </div>
          <button
            aria-label="Toggle email reminders"
            type="button"
            onClick={handleToggleNotifications}
            disabled={isUpdatingNotifications}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition ${
              notificationsEnabled ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
            } ${isUpdatingNotifications ? 'opacity-70' : ''}`}
            aria-pressed={notificationsEnabled}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                notificationsEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <form className="space-y-3" onSubmit={handleRequestEmailChange}>
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            New email
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
            {isSubmitting ? 'Sending...' : 'Send confirmation'}
          </button>
          {emailChangeStatus ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">{emailChangeStatus}</p>
          ) : null}
        </form>

        <div className="border-t border-dashed border-neutral-200 pt-4 dark:border-neutral-700">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            onClick={handleSwitchAccount}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out...' : 'Switch account'}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ProfileAccountPanel;
