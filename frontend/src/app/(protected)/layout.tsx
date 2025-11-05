'use client';

import type { ReactElement, ReactNode } from 'react';

import AppFooter from '@/components/AppFooter';
import AppHeader from '@/components/AppHeader';
import AuthGuard from '@/components/AuthGuard';
import { RealtimeStatusProvider } from '@/context/realtimeStatus';

type ProtectedLayoutProps = {
  children: ReactNode;
};

const ProtectedLayout = ({ children }: ProtectedLayoutProps): ReactElement => {
  const shellStyle = {
    minHeight: 'calc(var(--app-shell-min-height) + var(--safe-top) + var(--safe-bottom))',
  } as const;

  const mainStyle = {
    paddingBottom: 'calc(var(--safe-bottom) + var(--space-xl))',
  } as const;

  return (
    <AuthGuard>
      <RealtimeStatusProvider>
        <div className="flex flex-col text-neutral-900" style={shellStyle}>
          <AppHeader />
          <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 lg:px-8" style={mainStyle}>
            {children}
          </main>
          <AppFooter />
        </div>
      </RealtimeStatusProvider>
    </AuthGuard>
  );
};

export default ProtectedLayout;
