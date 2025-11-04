import type { JSX } from 'react';

import FeaturesRow from '@/components/landing/FeaturesRow';
import Hero from '@/components/landing/Hero';
import SiteFooter from '@/components/layout/SiteFooter';
import SiteHeader from '@/components/layout/SiteHeader';

const Home = (): JSX.Element => (
  <div className="flex min-h-[100svh] flex-col">
    <SiteHeader />
    <main className="flex flex-1 flex-col">
      <Hero />
      <FeaturesRow />
    </main>
    <SiteFooter />
  </div>
);

export default Home;
