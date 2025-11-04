'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type JSX } from 'react';

import { t } from '@/lib/i18n';
import { type Profile, updateMe, uploadAvatar } from '@/lib/profileApi';
import { dispatchProfileAvatarUpdated } from '@/lib/profileEvents';

type NotificationType = 'success' | 'error';

type ProfileGeneralFormProps = {
  profile: Profile;
  onProfileUpdate: (profile: Profile) => void;
  onNotify: (type: NotificationType, message: string) => void;
};

const normalizeField = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const computeInitials = (name: string | null, email: string): string => {
  const parts = name
    ?.split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase())
    .slice(0, 2)
    .join('');

  if (parts && parts.length > 0) {
    return parts;
  }

  return email[0]?.toUpperCase() ?? 'U';
};

const ProfileGeneralForm = ({ profile, onProfileUpdate, onNotify }: ProfileGeneralFormProps): JSX.Element => {
  const [name, setName] = useState<string>(profile.name ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fieldClassName =
    'w-full rounded-[20px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm transition focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)]';
  const labelClassName = 'text-sm font-semibold text-[var(--color-text-primary)]';
  const cardClassName =
    'rounded-[28px] border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-6 py-6 shadow-sm sm:px-8 sm:py-8';

  useEffect(() => {
    setName(profile.name ?? '');
  }, [profile.name]);

  const initials = useMemo(() => computeInitials(profile.name, profile.email), [profile.email, profile.name]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const updatedProfile = await updateMe({
        name: normalizeField(name),
      });
      onProfileUpdate(updatedProfile);
      onNotify('success', t('profile.general.toast.success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('profile.general.toast.unknownError');
      onNotify('error', t('profile.general.toast.error', { message }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isUploading) {
      return;
    }

    setIsUploading(true);
    try {
      const { avatar_url } = await uploadAvatar(file);
      const updatedProfile: Profile = {
        ...profile,
        avatar_url,
      };
      onProfileUpdate(updatedProfile);
      dispatchProfileAvatarUpdated(avatar_url);
      onNotify('success', t('profile.general.toast.success'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('profile.general.toast.unknownError');
      onNotify('error', t('profile.general.toast.error', { message }));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <header>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('profile.general.title')}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{t('profile.general.description')}</p>
      </header>

      <section className={cardClassName}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-muted)] text-lg font-semibold text-[var(--color-text-secondary)]">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={profile.name ?? profile.email} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className={labelClassName}>
              {t('profile.general.avatar.label')}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isUploading}
                className="mt-2 block w-full text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-accent-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-text-inverse)] transition hover:file:bg-[var(--color-accent-primary-strong)] disabled:cursor-not-allowed disabled:file:opacity-70"
              />
            </label>
            <p className="text-xs text-[var(--color-text-muted)]">{t('profile.general.avatar.help')}</p>
            {isUploading ? (
              <p className="text-xs text-[var(--color-accent-primary)]" role="status">
                {t('profile.general.avatar.uploading')}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={cardClassName}>
        <label className={`${labelClassName} flex flex-col gap-2`}>
          {t('profile.general.field.name')}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('profile.general.field.namePlaceholder')}
            autoComplete="name"
            className={fieldClassName}
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn--primary btn--pill" disabled={isSaving}>
          {isSaving ? t('profile.general.actions.saving') : t('profile.general.actions.save')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--pill"
          onClick={() => setName(profile.name ?? '')}
          disabled={isSaving}
        >
          {t('profile.general.actions.reset')}
        </button>
      </div>
    </form>
  );
};

export default ProfileGeneralForm;
