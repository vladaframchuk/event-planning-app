'use client';

import { useCallback, useEffect, useState } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';
import { isAuthenticated } from '@/lib/authClient';

export type AuthStatus = 'unknown' | 'guest' | 'authenticated';

const resolveStatus = (): AuthStatus => (isAuthenticated() ? 'authenticated' : 'guest');

export const useAuthStatus = (): AuthStatus => {
  const [status, setStatus] = useState<AuthStatus>('unknown');

  const evaluate = useCallback(() => {
    setStatus(resolveStatus());
  }, []);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  useEffect(() => {
    const handleStorage = () => {
      evaluate();
    };

    const handleFocus = () => {
      evaluate();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        evaluate();
      }
    };

    const handleAuthEvent = () => {
      evaluate();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    window.addEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent as EventListener);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthEvent as EventListener);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [evaluate]);

  return status;
};

