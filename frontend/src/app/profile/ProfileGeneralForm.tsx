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
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">{t('profile.general.title')}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('profile.general.description')}</p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-lg font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-100">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt={profile.name ?? profile.email} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <label className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {t('profile.general.avatar.label')}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={isUploading}
                className="mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 disabled:cursor-not-allowed disabled:file:bg-blue-300 dark:text-neutral-200"
              />
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('profile.general.avatar.help')}</p>
            {isUploading ? (
              <p className="text-xs text-blue-600 dark:text-blue-400" role="status">
                {t('profile.general.avatar.uploading')}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {t('profile.general.field.name')}
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('profile.general.field.namePlaceholder')}
              autoComplete="name"
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          disabled={isSaving}
        >
          {isSaving ? t('profile.general.actions.saving') : t('profile.general.actions.save')}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
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
