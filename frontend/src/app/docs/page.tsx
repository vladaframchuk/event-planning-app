import type { JSX } from 'react';

import ReDocContainer from '@/components/docs/ReDocContainer';
import SiteFooter from '@/components/layout/SiteFooter';
import SiteHeader from '@/components/layout/SiteHeader';

const shellStyle = {
  minHeight: 'calc(var(--app-shell-min-height) + var(--safe-top) + var(--safe-bottom))',
} as const;

const DocsPage = (): JSX.Element => (
  <div className="flex flex-col" style={shellStyle}>
    <SiteHeader />
    <main className="flex flex-1 flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <ReDocContainer />
    </main>
    <SiteFooter />
  </div>
);

export default DocsPage;
