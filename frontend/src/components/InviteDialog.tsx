'use client';

import { type ChangeEvent, type FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react';

import { createInvite, type CreateInvitePayload } from '@/lib/invitesApi';

type InviteDialogProps = {
  eventId: number;
  open: boolean;
  onClose: () => void;
};

type InviteSummary = {
  invite_url: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
};

type CopyState = 'idle' | 'copied' | 'error';

const focusableSelector =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const InviteDialog = ({ eventId, open, onClose }: InviteDialogProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const [formValues, setFormValues] = useState<CreateInvitePayload>({ expiresInHours: 48, maxUses: 0 });
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      firstFieldRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const node = dialogRef.current;
    if (!node) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = node.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === first || !node.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener('keydown', handleKeyDown);
    return () => {
      node.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setFormValues({ expiresInHours: 48, maxUses: 0 });
      setInvite(null);
      setError(null);
      setCopyState('idle');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleOverlayClick = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const handleContainerClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleNumberChange =
    (field: keyof CreateInvitePayload, min: number, max: number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(parsed)) {
        setFormValues((prev) => ({ ...prev, [field]: min }));
        return;
      }

      const clamped = Math.min(Math.max(parsed, min), max);
      setFormValues((prev) => ({ ...prev, [field]: clamped }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setCopyState('idle');

    try {
      const result = await createInvite(eventId, formValues);
      setInvite(result);
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : 'Не удалось создать ссылку приглашения. Попробуйте позже.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!invite) {
      return;
    }

    try {
      await navigator.clipboard.writeText(invite.invite_url);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  };

  const formattedExpiresAt = (() => {
    if (!invite) {
      return null;
    }

    const date = new Date(invite.expires_at);
    if (Number.isNaN(date.getTime())) {
      return invite.expires_at;
    }

    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  })();

  const usesLeft = invite
    ? invite.max_uses === 0
      ? null
      : Math.max(invite.max_uses - invite.uses_count, 0)
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 px-4 py-6"
      role="presentation"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-dialog-title"
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition dark:bg-neutral-900"
        onClick={handleContainerClick}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="invite-dialog-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              Пригласить участников
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Создайте новую ссылку-приглашение и поделитесь ею с командой.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Закрыть
          </button>
        </header>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="invite-expires"
              className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              Время действия (в часах)
            </label>
            <input
              ref={firstFieldRef}
              id="invite-expires"
              type="number"
              min={1}
              max={168}
              value={formValues.expiresInHours}
              onChange={handleNumberChange('expiresInHours', 1, 168)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              required
              aria-describedby="invite-expires-help"
            />
            <p id="invite-expires-help" className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Допустимое значение: от 1 до 168 часов.
            </p>
          </div>

          <div>
            <label
              htmlFor="invite-max-uses"
              className="mb-1 block text-sm font-medium text-neutral-800 dark:text-neutral-200"
            >
              Максимум использований
            </label>
            <input
              id="invite-max-uses"
              type="number"
              min={0}
              max={1000}
              value={formValues.maxUses}
              onChange={handleNumberChange('maxUses', 0, 1000)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
              aria-describedby="invite-max-uses-help"
            />
            <p id="invite-max-uses-help" className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Значение 0 означает отсутствие ограничений.
            </p>
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              disabled={isSubmitting}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Создание…' : 'Создать ссылку'}
            </button>
          </div>
        </form>

        {invite ? (
          <div className="mt-6 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm shadow-inner dark:border-neutral-800 dark:bg-neutral-950">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                Ссылка приглашения
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={invite.invite_url}
                  readOnly
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Копировать
                </button>
              </div>
              {copyState === 'copied' ? (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400">Ссылка скопирована.</p>
              ) : null}
              {copyState === 'error' ? (
                <p className="mt-1 text-xs text-red-500">Не удалось скопировать ссылку.</p>
              ) : null}
            </div>
            <div className="space-y-1 text-neutral-600 dark:text-neutral-300">
              <p>
                Действует до: <span className="font-medium text-neutral-900 dark:text-neutral-50">{formattedExpiresAt}</span>
              </p>
              <p>
                Осталось использований:{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-50">
                  {usesLeft === null ? 'без ограничений' : usesLeft}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default InviteDialog;
