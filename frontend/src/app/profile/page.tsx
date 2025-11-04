'use client';

import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';

import { t, type TranslationKey } from '@/lib/i18n';
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

const tabConfig: Array<{ key: TabKey; labelKey: TranslationKey }> = [
  { key: 'general', labelKey: 'profile.tabs.general' },
  { key: 'security', labelKey: 'profile.tabs.security' },
  { key: 'account', labelKey: 'profile.tabs.account' },
];

const Skeleton = (): JSX.Element => (
  <div className="space-y-6">
    <div className="space-y-3">
      <div className="skeleton h-6 w-32 rounded-full" />
      <div className="skeleton h-4 w-48 rounded-full" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-5 shadow-sm">
          <div className="skeleton h-4 w-28 rounded-full" />
          <div className="skeleton mt-3 h-10 w-full rounded-[16px]" />
        </div>
      ))}
    </div>
  </div>
);

const ProfilePage = (): JSX.Element => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [isLoading, setIsLoading] = useState(true);
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
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMe();
      setProfile(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('profile.errors.load');
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
        <div className="flex flex-col gap-4 rounded-[24px] border border-[var(--color-error-soft)] bg-[var(--color-error-soft)]/40 px-6 py-6 text-sm text-[var(--color-error)] shadow-sm">
          <p>{error}</p>
          <button type="button" className="btn btn--ghost btn--pill w-fit" onClick={() => void loadProfile()}>
            {t('profile.actions.retry')}
          </button>
        </div>
      );
    }

    if (!profile) {
      return null;
    }

    switch (activeTab) {
      case 'general':
        return <ProfileGeneralForm profile={profile} onProfileUpdate={setProfile} onNotify={showToast} />;
      case 'security':
        return <ProfileSecurityForm onNotify={showToast} />;
      case 'account':
        return (
          <ProfileAccountPanel
            email={profile.email}
            emailNotificationsEnabled={profile.email_notifications_enabled}
            onNotify={showToast}
            onEmailNotificationsChange={(value) =>
              setProfile((current) => (current ? { ...current, email_notifications_enabled: value } : current))
            }
          />
        );
      default:
        return null;
    }
  }, [activeTab, error, isLoading, loadProfile, profile, showToast]);

  const tabPanelId = `profile-tab-${activeTab}-panel`;

  return (
    <section className="w-full px-4 pb-16 pt-10 sm:px-8 lg:px-16 xl:px-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-8 py-10 shadow-[var(--shadow-md)] sm:px-12 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
            {t('profile.header.kicker')}
          </p>
          <h1 className="mt-3 text-[clamp(2rem,3vw,2.8rem)] font-semibold leading-[1.08] text-[var(--color-text-primary)]">
            {t('profile.header.title')}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-[var(--line-height-relaxed)] text-[var(--color-text-secondary)]">
            {t('profile.header.subtitle')}
          </p>
        </header>

        <div className="rounded-[32px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] shadow-[var(--shadow-sm)]">
          <div className="flex flex-col gap-6 px-6 py-6 sm:px-10 sm:py-10">
            <nav
              className="flex flex-wrap gap-2"
              role="tablist"
              aria-label={t('profile.tabs.aria')}
            >
              {tabConfig.map(({ key, labelKey }) => {
                const isActive = key === activeTab;
                const tabId = `profile-tab-${key}`;
                return (
                  <button
                    key={key}
                    id={tabId}
                    type="button"
                    role="tab"
                    aria-controls={`${tabId}-panel`}
                    aria-selected={isActive}
                    onClick={() => setActiveTab(key)}
                    className={[
                      'rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)]',
                      isActive
                        ? 'bg-[var(--color-accent-primary)] text-[var(--color-text-inverse)] shadow-[var(--shadow-sm)]'
                        : 'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent-primary)]',
                    ].join(' ')}
                  >
                    {t(labelKey)}
                  </button>
                );
              })}
            </nav>

            <div
              id={tabPanelId}
              role="tabpanel"
              aria-labelledby={`profile-tab-${activeTab}`}
              className="rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-primary)] px-6 py-8 shadow-inner sm:px-10 sm:py-10"
            >
              {currentContent}
            </div>
          </div>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            'fixed right-6 top-24 z-50 min-w-[240px] rounded-full px-5 py-3 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--shadow-md)]',
            toast.type === 'success' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
};

export default ProfilePage;
