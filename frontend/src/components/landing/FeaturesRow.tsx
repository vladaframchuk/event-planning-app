import { type JSX } from 'react';

import { t } from '@/lib/i18n';

type Feature = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: JSX.Element;
};

const buildFeatures = (): Feature[] => [
  {
    id: 'plan',
    title: t('landing.features.plan.title'),
    description: t('landing.features.plan.description'),
    icon: (
      <svg
        aria-hidden="true"
        focusable="false"
        className="h-10 w-10 text-[color:var(--color-accent-primary)]"
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="8" y="10" width="32" height="30" rx="8" fill="currentColor" opacity="0.14" />
        <path
          d="M16 8h16a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z"
          fill="currentColor"
          opacity="0.25"
        />
        <path d="M18 17h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M18 23h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'polls',
    title: t('landing.features.polls.title'),
    description: t('landing.features.polls.description'),
    icon: (
      <svg
        aria-hidden="true"
        focusable="false"
        className="h-10 w-10 text-[color:var(--color-success)]"
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="10" y="8" width="28" height="32" rx="8" fill="currentColor" opacity="0.14" />
        <path
          d="M18 24.5 22 28l8-12"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: 'chat',
    title: t('landing.features.chat.title'),
    description: t('landing.features.chat.description'),
    icon: (
      <svg
        aria-hidden="true"
        focusable="false"
        className="h-10 w-10 text-[color:var(--color-accent-primary)]"
        viewBox="0 0 48 48"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 12h20a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6h-5l-7 8v-8h-8a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6Z"
          fill="currentColor"
          opacity="0.18"
        />
        <circle cx="18.5" cy="21.5" r="1.8" fill="currentColor" />
        <circle cx="24" cy="21.5" r="1.8" fill="currentColor" />
        <circle cx="29.5" cy="21.5" r="1.8" fill="currentColor" />
      </svg>
    ),
  },
];

const sectionStyle = {
  paddingBottom: 'calc(var(--safe-bottom) + var(--space-xl))',
} as const;

const FeaturesRow = (): JSX.Element => {
  const features = buildFeatures();

  return (
    <section className="w-full bg-transparent px-4 pb-16 sm:px-6 lg:px-8" style={sectionStyle}>
      <div
        className="mx-auto flex w-full max-w-6xl flex-col gap-8"
        style={{ contentVisibility: 'auto', containIntrinsicSize: '480px' }}
      >
        <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[color:var(--color-text-primary)] sm:text-3xl">
          {t('landing.features.heading')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.id}
              data-surface="card"
              className="flex h-full flex-col gap-4 rounded-2xl border border-[color:rgba(54,92,255,0.12)] bg-[color:rgba(255,255,255,0.86)]/80 p-6 backdrop-blur supports-[backdrop-filter]:bg-[color:rgba(255,255,255,0.75)]"
            >
              {feature.icon}
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
                  {feature.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesRow;
