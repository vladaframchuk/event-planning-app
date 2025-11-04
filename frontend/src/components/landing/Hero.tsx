'use client';

import Image from 'next/image';
import Link from 'next/link';
import { type JSX } from 'react';

import { t } from '@/lib/i18n';

const containerStyle = {
  paddingTop: 'calc(var(--safe-top) + var(--space-2xl))',
  paddingBottom: 'calc(var(--safe-bottom) + var(--space-xl))',
  minHeight: 'min(760px, max(520px, calc(100svh - var(--header-height))))',
} as const;

const primaryButtonClasses = 'btn btn--primary inline-flex items-center justify-center';
const secondaryButtonClasses = 'btn btn--dark inline-flex items-center justify-center';

const Hero = (): JSX.Element => {
  return (
    <section
      className="relative w-full"
      style={containerStyle}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex w-full max-w-2xl flex-col gap-6 text-left">
          <span className="inline-flex max-w-fit items-center rounded-full bg-[rgba(54,92,255,0.12)] px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--color-accent-primary)]">
            {t('landing.hero.badge')}
          </span>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-[color:var(--color-text-primary)] sm:text-5xl lg:text-6xl">
            {t('landing.hero.title')}
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-[color:var(--color-text-secondary)] sm:text-lg">
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/events" className={primaryButtonClasses} aria-label={t('landing.hero.primaryCta')}>
              {t('landing.hero.primaryCta')}
            </Link>
            <Link href="/events" className={secondaryButtonClasses} aria-label={t('landing.hero.secondaryCta')}>
              {t('landing.hero.secondaryCta')}
            </Link>
          </div>
        </div>
        <div className="flex w-full justify-center lg:max-w-xl">
          <Image
            src="/Main.png"
            alt=""
            width={420}
            height={360}
            priority
            sizes="(min-width: 1024px) 420px, 80vw"
            className="h-auto w-full max-w-[420px] rounded-[32px] drop-shadow-[0_30px_80px_rgba(31,45,92,0.25)]"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
