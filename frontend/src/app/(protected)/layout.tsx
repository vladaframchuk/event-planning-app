import type { ReactElement, ReactNode } from 'react';

import AppHeader from '@/components/AppHeader';
import AuthGuard from '@/components/AuthGuard';

type ProtectedLayoutProps = {
  children: ReactNode;
};

const ProtectedLayout = ({ children }: ProtectedLayoutProps): ReactElement => {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        <AppHeader />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </AuthGuard>
  );
};

export default ProtectedLayout;
