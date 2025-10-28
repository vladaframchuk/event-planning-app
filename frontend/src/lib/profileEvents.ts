export const PROFILE_AVATAR_UPDATED_EVENT = 'epa-profile-avatar-updated' as const;

export type ProfileAvatarUpdatedDetail = {
  avatarUrl: string;
};

declare global {
  interface WindowEventMap {
    'epa-profile-avatar-updated': CustomEvent<ProfileAvatarUpdatedDetail>;
  }
}

export const dispatchProfileAvatarUpdated = (avatarUrl: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const event = new CustomEvent<ProfileAvatarUpdatedDetail>(PROFILE_AVATAR_UPDATED_EVENT, {
    detail: { avatarUrl },
  });
  window.dispatchEvent(event);
};
