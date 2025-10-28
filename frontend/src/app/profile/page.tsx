'use client';

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';

import { getMe, type Profile } from '@/lib/profileApi';

import ProfileAccountPanel from './ProfileAccountPanel';
import ProfileGeneralForm from './ProfileGeneralForm';
import ProfileSecurityForm from './ProfileSecurityForm';

type TabKey = 'general' | 'security' | 'account';

type ToastState = {
  id: number;
  type: 'success' | 'error';
  message: string;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'general', label: 'Общее' },
  { key: 'security', label: 'Безопасность' },
  { key: 'account', label: 'Аккаунт' },
];

const Skeleton = (): JSX.Element => (
  <div className="space-y-6">
    <div className="space-y-2">
      <div className="h-6 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="h-4 w-56 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
    </div>
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <div className="space-y-3">
          <div className="h-3 w-28 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-3 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
        </div>
      </div>
      <div className="grid flex-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-10 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ProfilePage = (): JSX.Element => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({
      id: Date.now(),
      type,
      message,
    });
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [toast]);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMe();
      setProfile(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Не удалось загрузить профиль. Попробуйте обновить страницу.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const currentContent = useMemo(() => {
    if (isLoading) {
      return <Skeleton />;
    }

    if (error) {
      return (
        <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          <p>{error}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            onClick={() => void loadProfile()}
          >
            Повторить
          </button>
        </div>
      );
    }

    if (!profile) {
      return null;
    }

    switch (activeTab) {
      case 'general':
        return (
          <ProfileGeneralForm
            profile={profile}
            onProfileUpdate={setProfile}
            onNotify={showToast}
          />
        );
      case 'security':
        return <ProfileSecurityForm onNotify={showToast} />;
      case 'account':
        return <ProfileAccountPanel email={profile.email} onNotify={showToast} />;
      default:
        return null;
    }
  }, [activeTab, error, isLoading, loadProfile, profile, showToast]);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <nav className="flex border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/60" aria-label="Настройки профиля">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  'flex-1 px-4 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                  isActive
                    ? 'border-b-2 border-blue-600 bg-white text-blue-600 dark:border-blue-400 dark:bg-neutral-900 dark:text-blue-300'
                    : 'text-neutral-600 hover:bg-white dark:text-neutral-400 dark:hover:bg-neutral-900',
                ].join(' ')}
                aria-selected={isActive}
                role="tab"
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="p-6" role="tabpanel">
          {currentContent}
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            'fixed right-6 top-20 z-50 min-w-[240px] rounded-md px-4 py-3 text-sm text-white shadow-lg',
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
};

export default ProfilePage;
