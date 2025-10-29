'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAccessToken, logout } from '@/lib/authClient';
import { getMe } from '@/lib/profileApi';
import { PROFILE_AVATAR_UPDATED_EVENT, type ProfileAvatarUpdatedDetail } from '@/lib/profileEvents';

import { AUTH_CHANGE_EVENT_NAME } from './AuthGuard';

type DecodedToken = Record<string, unknown> | null;

type ProfileSummary = {
  displayName: string;
  initials: string;
  avatarUrl?: string;
};

const ACCESS_TOKEN_KEY = 'epa_access';
const REFRESH_TOKEN_KEY = 'epa_refresh';

const decodeSegment = (segment: string): string | null => {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);

    // Handle unicode characters in JWT payloads
    const utf8 = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );

    return utf8;
  } catch {
    return null;
  }
};

const decodeTokenPayload = (token: string | null): DecodedToken => {
  if (!token) {
    return null;
  }

  const [, payloadSegment] = token.split('.');
  if (!payloadSegment) {
    return null;
  }

  const decoded = decodeSegment(payloadSegment);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const extractString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const pickFirstString = (payload: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = extractString(payload[key]);
    if (value) {
      return value;
    }
  }

  return null;
};

const computeInitials = (fullName: string | null, email: string | null): string => {
  const fromName =
    fullName
      ?.split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase())
      .slice(0, 2)
      .join('') ?? '';

  if (fromName.length > 0) {
    return fromName;
  }

  const fromEmail = email?.[0]?.toUpperCase();
  if (fromEmail) {
    return fromEmail;
  }

  return 'U';
};

const buildProfileSummary = (): ProfileSummary => {
  const payload = decodeTokenPayload(getAccessToken());

  if (!payload) {
    return { displayName: 'Гость', initials: 'U' };
  }

  const avatarUrl = pickFirstString(payload, ['avatar', 'avatar_url', 'avatarUrl', 'picture']);
  const fullName =
    pickFirstString(payload, ['name', 'full_name', 'fullName']) ??
    [pickFirstString(payload, ['first_name', 'firstName']), pickFirstString(payload, ['last_name', 'lastName'])]
      .filter(Boolean)
      .join(' ')
      .trim();

  const email = pickFirstString(payload, ['email', 'preferred_username', 'sub']);
  const displayName = fullName && fullName.length > 0 ? fullName : email ?? 'Профиль';
  const initials = computeInitials(fullName ?? null, email ?? null);

  return {
    displayName,
    initials,
    avatarUrl: avatarUrl ?? undefined,
  };
};

const AUTH_STORAGE_KEYS = new Set([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);

const HEADER_ID = 'app-header-profile-button';

const menuClasses =
  'block w-full rounded-md px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none dark:text-neutral-200 dark:hover:bg-neutral-700 dark:focus:bg-neutral-700';

const avatarBaseClasses =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-transparent bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400';

const dispatchAuthEvent = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT_NAME));
};

const AppHeader = (): JSX.Element => {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<ProfileSummary>(() => buildProfileSummary());
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const refreshProfileFromToken = useCallback(() => {
    setProfile(buildProfileSummary());
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await getMe();
      const normalizedName = data.name?.trim() ?? '';
      const fallbackEmail = data.email;
      setProfile({
        displayName: normalizedName.length > 0 ? normalizedName : fallbackEmail,
        initials: computeInitials(normalizedName.length > 0 ? normalizedName : null, fallbackEmail),
        avatarUrl: data.avatar_url ?? undefined,
      });
    } catch {
      refreshProfileFromToken();
    }
  }, [refreshProfileFromToken]);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, closeMenu]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || AUTH_STORAGE_KEYS.has(event.key)) {
        refreshProfileFromToken();
        void refreshProfile();
      }
    };

    const handleAuthEvent = () => {
      refreshProfileFromToken();
      void refreshProfile();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent);
    };
  }, [refreshProfile, refreshProfileFromToken]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const handleAvatarUpdated = (event: CustomEvent<ProfileAvatarUpdatedDetail>) => {
      const url = event.detail?.avatarUrl ?? undefined;
      setProfile((prev) => ({
        ...prev,
        avatarUrl: url,
      }));
    };

    const listener = (event: Event) => handleAvatarUpdated(event as CustomEvent<ProfileAvatarUpdatedDetail>);
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, listener);

    return () => {
      window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, listener);
    };
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  const handleProfileNavigation = useCallback(() => {
    closeMenu();
    router.push('/profile');
  }, [closeMenu, router]);

  const handleSwitchAccount = useCallback(() => {
    closeMenu();
    logout();
    dispatchAuthEvent();
    refreshProfileFromToken();
    void refreshProfile();
    router.push('/login');
  }, [closeMenu, refreshProfile, refreshProfileFromToken, router]);

  const handleLogout = useCallback(() => {
    closeMenu();
    logout();
    dispatchAuthEvent();
    refreshProfileFromToken();
    void refreshProfile();
    router.refresh();
  }, [closeMenu, refreshProfile, refreshProfileFromToken, router]);

  const profileButtonLabel = useMemo(() => `Открыть меню профиля: ${profile.displayName}`, [profile.displayName]);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-neutral-800 dark:bg-neutral-900/85">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/events"
          className="text-lg font-semibold text-neutral-900 transition hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 dark:text-neutral-100 dark:hover:text-blue-400"
        >
          Event Planning
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            id={HEADER_ID}
            type="button"
            className={avatarBaseClasses}
            onClick={toggleMenu}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={isMenuOpen ? 'app-header-profile-menu' : undefined}
            aria-label={profileButtonLabel}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                className="h-full w-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-base leading-none">{profile.initials}</span>
            )}
          </button>

          {isMenuOpen ? (
            <div
              id="app-header-profile-menu"
              role="menu"
              aria-labelledby={HEADER_ID}
              className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
            >
              <p className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {profile.displayName}
              </p>
              <button type="button" className={menuClasses} role="menuitem" onClick={handleProfileNavigation}>
                Профиль
              </button>
              <button type="button" className={menuClasses} role="menuitem" onClick={handleSwitchAccount}>
                Сменить аккаунт
              </button>
              <button type="button" className={menuClasses} role="menuitem" onClick={handleLogout}>
                Выйти
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
