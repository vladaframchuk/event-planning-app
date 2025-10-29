'use client';

import { QueryClient, QueryClientProvider as _QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { AUTH_CHANGE_EVENT_NAME } from '@/components/AuthGuard';

const AUTH_STORAGE_KEYS = new Set(['epa_access', 'epa_refresh']);

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleAuthChange = () => {
      queryClient.clear();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || AUTH_STORAGE_KEYS.has(event.key)) {
        queryClient.clear();
      }
    };

    window.addEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT_NAME, handleAuthChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [queryClient]);

  return (
    <_QueryClientProvider client={queryClient}>
      {children}
    </_QueryClientProvider>
  );
}
