'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { createPoll } from '@/lib/pollsApi';
import type { Poll, PollType } from '@/types/poll';

type PollCreateDialogProps = {
  open: boolean;
  eventId: number;
  onClose: () => void;
  onCreated: (poll: Poll) => void;
};

type OptionDraft = {
  id: string;
  label: string;
  dateValue: string;
};

const pollTypeOptions: { value: PollType; label: string }[] = [
  { value: 'date', label: 'Дата' },
  { value: 'place', label: 'Место' },
  { value: 'custom', label: 'Свободный вопрос' },
];

const createOptionDraft = (): OptionDraft => ({
  id: Math.random().toString(36).slice(2),
  label: '',
  dateValue: '',
});

const resetOptionList = (): OptionDraft[] => [createOptionDraft(), createOptionDraft()];

const toIsoString = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const PollCreateDialog = ({ open, eventId, onClose, onCreated }: PollCreateDialogProps) => {
  const [pollType, setPollType] = useState<PollType>('custom');
  const [question, setQuestion] = useState('');
  const [multiple, setMultiple] = useState(false);
  const [allowChangeVote, setAllowChangeVote] = useState(true);
  const [endAt, setEndAt] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>(resetOptionList);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPollType('custom');
    setQuestion('');
    setMultiple(false);
    setAllowChangeVote(true);
    setEndAt('');
    setOptions(resetOptionList());
    setFormError(null);
  }, [open]);

  const canSubmit = useMemo(() => {
    if (question.trim().length === 0) {
      return false;
    }
    const filledOptions = options.filter((option) =>
      pollType === 'date' ? option.dateValue.trim().length > 0 : option.label.trim().length > 0,
    );
    return filledOptions.length >= 2 && !isSubmitting;
  }, [question, options, pollType, isSubmitting]);

  if (!open) {
    return null;
  }

  const handleAddOption = () => {
    setOptions((current) => [...current, createOptionDraft()]);
  };

  const handleRemoveOption = (id: string) => {
    setOptions((current) => (current.length <= 2 ? current : current.filter((option) => option.id !== id)));
  };

  const handleOptionChange = (id: string, value: string) => {
    setOptions((current) =>
      current.map((option) =>
        option.id === id
          ? {
              ...option,
              ...(pollType === 'date' ? { dateValue: value } : { label: value }),
            }
          : option,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) {
      return;
    }

    const trimmedQuestion = question.trim();
    const uniqueSet = new Set<string>();
    const preparedOptions: Array<{ label?: string; dateValue?: string }> = [];

    for (const option of options) {
      if (pollType === 'date') {
        const normalizedDate = option.dateValue.trim();
        if (normalizedDate.length === 0) {
          continue;
        }
        if (uniqueSet.has(normalizedDate)) {
          setFormError('Даты должны быть уникальными.');
          return;
        }
        uniqueSet.add(normalizedDate);
        preparedOptions.push({ dateValue: normalizedDate });
      } else {
        const normalizedLabel = option.label.trim();
        if (normalizedLabel.length === 0) {
          continue;
        }
        if (uniqueSet.has(normalizedLabel.toLowerCase())) {
          setFormError('Варианты должны быть уникальными.');
          return;
        }
        uniqueSet.add(normalizedLabel.toLowerCase());
        preparedOptions.push({ label: normalizedLabel });
      }
    }

    if (preparedOptions.length < 2) {
      setFormError('Добавьте не менее двух вариантов.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        type: pollType,
        question: trimmedQuestion,
        multiple,
        allowChangeVote,
        endAt: toIsoString(endAt),
        options: preparedOptions,
      };
      const poll = await createPoll(eventId, payload);
      onCreated(poll);
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось создать опрос. Попробуйте ещё раз.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6">
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-create-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="poll-create-title" className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Новый опрос
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Укажите вопрос и варианты ответа, чтобы участники могли проголосовать.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            aria-label="Закрыть диалог"
          >
            ✕
          </button>
        </div>

        <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit}>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Тип вопроса
            </legend>
            <div className="flex flex-wrap gap-3">
              {pollTypeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                    pollType === option.value
                      ? 'border-blue-600 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200'
                      : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-neutral-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="poll-type"
                    value={option.value}
                    checked={pollType === option.value}
                    onChange={() => setPollType(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Вопрос</span>
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Например: где встречаемся?"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={multiple}
                onChange={(event) => setMultiple(event.target.checked)}
              />
              Несколько вариантов
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={allowChangeVote}
                onChange={(event) => setAllowChangeVote(event.target.checked)}
              />
              Разрешать менять голос
            </label>
            <label className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                Завершить опрос до
              </span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              />
            </label>
          </div>

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Варианты ответа</h3>
              <button
                type="button"
                onClick={handleAddOption}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Добавить вариант
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {options.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950"
                >
                  {pollType === 'date' ? (
                    <input
                      type="date"
                      value={option.dateValue}
                      onChange={(event) => handleOptionChange(option.id, event.target.value)}
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  ) : (
                    <input
                      type="text"
                      value={option.label}
                      onChange={(event) => handleOptionChange(option.id, event.target.value)}
                      placeholder="Введите вариант"
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(option.id)}
                    className="rounded-full p-2 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    aria-label="Удалить вариант"
                    disabled={options.length <= 2}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          {formError ? <p className="text-sm text-red-600 dark:text-red-400">{formError}</p> : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-[var(--button-disabled-bg)] disabled:text-white disabled:opacity-100 disabled:shadow-none"
            >
              {isSubmitting ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PollCreateDialog;
