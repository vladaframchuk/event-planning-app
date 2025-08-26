'use client';

import { QueryClient, QueryClientProvider as _QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <_QueryClientProvider client={queryClient}>
      {children}
    </_QueryClientProvider>
  );
}