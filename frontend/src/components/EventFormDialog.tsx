'use client';

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';

import type { Event, EventInput } from '@/types/event';

export type EventFormSubmitPayload = EventInput & {
  title: string;
};

type EventFormDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EventFormSubmitPayload) => Promise<void> | void;
  initialEvent?: Event | null;
  loading?: boolean;
  errorMessage?: string | null;
};

type FormState = {
  title: string;
  category: string;
  description: string;
  startAt: string;
  endAt: string;
  location: string;
};

const emptyState: FormState = {
  title: '',
  category: '',
  description: '',
  startAt: '',
  endAt: '',
  location: '',
};

const formatForInput = (value: string | null): string => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIso = (value: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const buildInitialState = (event?: Event | null): FormState => {
  if (!event) {
    return emptyState;
  }

  return {
    title: event.title ?? '',
    category: event.category ?? '',
    description: event.description ?? '',
    startAt: formatForInput(event.startAt),
    endAt: formatForInput(event.endAt),
    location: event.location ?? '',
  };
};

const Dialog = ({
  open,
  onClose,
  onSubmit,
  initialEvent,
  loading = false,
  errorMessage,
}: EventFormDialogProps) => {
  const [formState, setFormState] = useState<FormState>(() => buildInitialState(initialEvent));
  const [fieldErrors, setFieldErrors] = useState<Record<keyof FormState | 'form', string>>({
    title: '',
    category: '',
    description: '',
    startAt: '',
    endAt: '',
    location: '',
    form: '',
  });

  useEffect(() => {
    if (open) {
      setFormState(buildInitialState(initialEvent));
      setFieldErrors({
        title: '',
        category: '',
        description: '',
        startAt: '',
        endAt: '',
        location: '',
        form: '',
      });
    }
  }, [initialEvent, open]);

  const modeLabel = useMemo(() => (initialEvent ? 'Сохранить' : 'Создать'), [initialEvent]);

  if (!open) {
    return null;
  }

  const handleChange =
    (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { value } = event.target;
      setFormState((prev) => ({
        ...prev,
        [field]: value,
      }));
      setFieldErrors((prev) => ({
        ...prev,
        [field]: '',
      }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: typeof fieldErrors = {
      title: '',
      category: '',
      description: '',
      startAt: '',
      endAt: '',
      location: '',
      form: '',
    };

    if (formState.title.trim().length === 0) {
      nextErrors.title = 'Название обязательно.';
    }

    const startIso = toIso(formState.startAt);
    const endIso = toIso(formState.endAt);
    if (formState.startAt && !startIso) {
      nextErrors.startAt = 'Неверный формат даты начала.';
    }
    if (formState.endAt && !endIso) {
      nextErrors.endAt = 'Неверный формат даты окончания.';
    }

    if (startIso && endIso) {
      const startDate = new Date(startIso);
      const endDate = new Date(endIso);
      if (endDate < startDate) {
        nextErrors.endAt = 'Дата окончания не может быть раньше даты начала.';
      }
    }

    const hasErrors = Object.values(nextErrors).some((value) => value.length > 0);
    if (hasErrors) {
      setFieldErrors(nextErrors);
      return;
    }

    try {
      await onSubmit({
        title: formState.title.trim(),
        category: formState.category.trim() || '',
        description: formState.description.trim() || '',
        startAt: startIso,
        endAt: endIso,
        location: formState.location.trim() || '',
      });
    } catch (error) {
      setFieldErrors((prev) => ({
        ...prev,
        form: error instanceof Error ? error.message : 'Не удалось сохранить событие.',
      }));
    }
  };

  const close = () => {
    if (!loading) {
      onClose();
    }
  };

  const effectiveError = fieldErrors.form || errorMessage || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 px-4 py-8 backdrop-blur-sm sm:px-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-dialog-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lg dark:bg-neutral-900">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="event-form-dialog-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {initialEvent ? 'Редактирование события' : 'Новое событие'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Заполните основные параметры мероприятия.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-neutral-800"
            aria-label="Закрыть"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="event-title" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
              Название *
            </label>
            <input
              id="event-title"
              type="text"
              value={formState.title}
              onChange={handleChange('title')}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              placeholder="Например, «Демо продукта»"
              disabled={loading}
            />
            {fieldErrors.title ? <p className="mt-1 text-xs text-red-500">{fieldErrors.title}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="event-category"
                className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
              >
                Категория
              </label>
              <input
                id="event-category"
                type="text"
                value={formState.category}
                onChange={handleChange('category')}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="meetup, workshop..."
                disabled={loading}
              />
              {fieldErrors.category ? <p className="mt-1 text-xs text-red-500">{fieldErrors.category}</p> : null}
            </div>
            <div>
              <label
                htmlFor="event-location"
                className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
              >
                Локация
              </label>
              <input
                id="event-location"
                type="text"
                value={formState.location}
                onChange={handleChange('location')}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="Адрес или ссылка"
                disabled={loading}
              />
              {fieldErrors.location ? <p className="mt-1 text-xs text-red-500">{fieldErrors.location}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="event-start-at"
                className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
              >
                Начало
              </label>
              <input
                id="event-start-at"
                type="datetime-local"
                value={formState.startAt}
                onChange={handleChange('startAt')}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                disabled={loading}
              />
              {fieldErrors.startAt ? <p className="mt-1 text-xs text-red-500">{fieldErrors.startAt}</p> : null}
            </div>
            <div>
              <label
                htmlFor="event-end-at"
                className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
              >
                Окончание
              </label>
              <input
                id="event-end-at"
                type="datetime-local"
                value={formState.endAt}
                onChange={handleChange('endAt')}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                disabled={loading}
              />
              {fieldErrors.endAt ? <p className="mt-1 text-xs text-red-500">{fieldErrors.endAt}</p> : null}
            </div>
          </div>

          <div>
            <label
              htmlFor="event-description"
              className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
            >
              Описание
            </label>
            <textarea
              id="event-description"
              value={formState.description}
              onChange={handleChange('description')}
              className="h-28 w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              placeholder="Расскажите участникам, что будет происходить."
              disabled={loading}
            />
            {fieldErrors.description ? <p className="mt-1 text-xs text-red-500">{fieldErrors.description}</p> : null}
          </div>

          {effectiveError ? <p className="text-sm text-red-500">{effectiveError}</p> : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={loading}
            >
              {loading ? 'Сохраняем…' : modeLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Dialog;
