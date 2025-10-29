'use client';

import { type FormEvent, type JSX, useEffect, useMemo, useState } from 'react';

type TaskCreateDialogProps = {
  open: boolean;
  listTitle: string;
  onClose: () => void;
  onSubmit: (payload: { title: string; description?: string; startAt?: string | null; dueAt?: string | null }) => Promise<void>;
  loading?: boolean;
  errorMessage?: string | null;
};

type FormState = {
  title: string;
  description: string;
  startAt: string;
  dueAt: string;
};

const emptyForm: FormState = {
  title: '',
  description: '',
  startAt: '',
  dueAt: '',
};

const toIso = (value: string): string | null => {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const TaskCreateDialog = ({ open, listTitle, onClose, onSubmit, loading = false, errorMessage }: TaskCreateDialogProps): JSX.Element | null => {
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(emptyForm);
      setFormError(null);
    }
  }, [open]);

  const effectiveError = useMemo(() => formError ?? errorMessage ?? null, [errorMessage, formError]);

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      setFormError('Введите название задачи.');
      return;
    }
    setFormError(null);
    try {
      await onSubmit({
        title: formState.title.trim(),
        description: formState.description.trim() ? formState.description.trim() : undefined,
        startAt: toIso(formState.startAt),
        dueAt: toIso(formState.dueAt),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось создать задачу. Попробуйте ещё раз.';
      setFormError(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/45 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">Новая задача</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Список: «{listTitle}»</p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="task-dialog-title" className="text-xs font-semibold uppercase text-neutral-500">
              Название
            </label>
            <input
              id="task-dialog-title"
              type="text"
              value={formState.title}
              onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              placeholder="Например, подготовить материалы"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="task-dialog-description" className="text-xs font-semibold uppercase text-neutral-500">
              Описание
            </label>
            <textarea
              id="task-dialog-description"
              value={formState.description}
              onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              placeholder="Кратко опишите, что нужно сделать."
              disabled={loading}
            />
          </div>

  <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="task-dialog-start" className="text-xs font-semibold uppercase text-neutral-500">
                Начать
              </label>
              <input
                id="task-dialog-start"
                type="datetime-local"
                value={formState.startAt}
                onChange={(event) => setFormState((prev) => ({ ...prev, startAt: event.target.value }))}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="task-dialog-due" className="text-xs font-semibold uppercase text-neutral-500">
                Дедлайн
              </label>
              <input
                id="task-dialog-due"
                type="datetime-local"
                value={formState.dueAt}
                onChange={(event) => setFormState((prev) => ({ ...prev, dueAt: event.target.value }))}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                disabled={loading}
              />
            </div>
          </div>

          {effectiveError ? <p className="text-sm text-red-600 dark:text-red-400">{effectiveError}</p> : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              disabled={loading}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-70"
            >
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskCreateDialog;
