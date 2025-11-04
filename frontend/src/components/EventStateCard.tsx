'use client';

import { type JSX, type ReactNode } from 'react';

type EventStateTone = 'info' | 'error' | 'warning';

type EventStateCardProps = {
  tone: EventStateTone;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

const TONE_STYLES: Record<EventStateTone, { border: string; background: string; text: string }> = {
  info: {
    border: 'border-[var(--color-accent-soft)]',
    background: 'bg-[var(--color-background-elevated)]',
    text: 'text-[var(--color-text-secondary)]',
  },
  warning: {
    border: 'border-[var(--color-warning-soft)]',
    background: 'bg-[var(--color-warning-soft)]/40',
    text: 'text-[var(--color-warning)]',
  },
  error: {
    border: 'border-[var(--color-error-soft)]',
    background: 'bg-[var(--color-error-soft)]/45',
    text: 'text-[var(--color-error)]',
  },
};

const EventStateCard = ({ tone, title, description, actions }: EventStateCardProps): JSX.Element => {
  const styles = TONE_STYLES[tone];

  return (
    <section
      className={`w-full rounded-3xl border ${styles.border} ${styles.background} px-6 py-7 shadow-sm sm:px-8 sm:py-9`}
      aria-live="polite"
    >
      <div className="flex flex-col gap-4">
        <h2 className={`text-xl font-semibold text-[var(--color-text-primary)]`}>{title}</h2>
        {description ? <div className={`text-sm leading-relaxed ${styles.text}`}>{description}</div> : null}
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
};

export default EventStateCard;
