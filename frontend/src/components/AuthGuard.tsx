'use client';

import { useRouter } from 'next/navigation';
import { type JSX, type PropsWithChildren, useCallback, useEffect, useState } from 'react';

import { isAuthenticated } from '@/lib/authClient';

export const AUTH_CHANGE_EVENT_NAME = 'epa-auth-change';

const ACCESS_TOKEN_KEY = 'epa_access';
const REFRESH_TOKEN_KEY = 'epa_refresh';
const AUTH_STORAGE_KEYS = new Set([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);

declare global {
  interface WindowEventMap {
    'epa-auth-change': CustomEvent<void>;
  }
}

const AuthGuard = ({ children }: PropsWithChildren): JSX.Element | null => {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'allowed'>('checking');

  const evaluateAuth = useCallback(() => {
    const authed = isAuthenticated();

    if (!authed) {
      setStatus('checking');
      router.replace('/login');
      return;
    }

    setStatus('allowed');
  }, [router]);

  useEffect(() => {
    evaluateAuth();
  }, [evaluateAuth]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || AUTH_STORAGE_KEYS.has(event.key)) {
        evaluateAuth();
      }
    };

    const handleFocus = () => {
      evaluateAuth();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluateAuth();
      }
    };

    const handleAuthEvent = () => {
      evaluateAuth();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [evaluateAuth]);

  if (status !== 'allowed') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500"
      >
        Перенаправляем...
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;
