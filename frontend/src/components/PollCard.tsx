'use client';

import { useEffect, useMemo, useState } from 'react';

import type { Poll, PollOption } from '@/types/poll';

type PollCardProps = {
  poll: Poll;
  canManage: boolean;
  onVote: (optionIds: number[]) => Promise<void> | void;
  onClose?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  votePending?: boolean;
  closePending?: boolean;
  deletePending?: boolean;
};

const formatOptionLabel = (pollType: Poll['type'], option: PollOption): string => {
  if (pollType === 'date' && option.dateValue) {
    const parsed = new Date(option.dateValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('ru-RU', { dateStyle: 'medium' });
    }
  }
  return option.label ?? '';
};

const formatDeadline = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
};

const PollCard = ({
  poll,
  canManage,
  onVote,
  onClose,
  onDelete,
  votePending = false,
  closePending = false,
  deletePending = false,
}: PollCardProps) => {
  const [selectedOptions, setSelectedOptions] = useState<number[]>(poll.myVotes);

  useEffect(() => {
    setSelectedOptions(poll.myVotes);
  }, [poll.myVotes, poll.id]);

  const isExpired = useMemo(() => {
    if (!poll.endAt) {
      return false;
    }
    const parsed = new Date(poll.endAt);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }
    return parsed.getTime() <= Date.now();
  }, [poll.endAt]);

  const deadlineLabel = useMemo(() => formatDeadline(poll.endAt), [poll.endAt]);
  const canModify = poll.allowChangeVote || poll.myVotes.length === 0;
  const isVotingDisabled = poll.isClosed || isExpired;
  const inputsDisabled = isVotingDisabled || (!canModify && poll.myVotes.length > 0);
  const selectedSummary =
    poll.options
      .filter((option) => selectedOptions.includes(option.id))
      .map((option) => formatOptionLabel(poll.type, option))
      .filter((label) => label.trim().length > 0)
      .join(', ') || '—';

  const handleSelectSingle = (optionId: number) => {
    if (inputsDisabled) {
      return;
    }
    setSelectedOptions([optionId]);
  };

  const handleToggleOption = (optionId: number) => {
    if (inputsDisabled) {
      return;
    }
    setSelectedOptions((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
  };

  const handleVote = () => {
    if (isVotingDisabled) {
      return;
    }
    if (!poll.multiple && selectedOptions.length === 0) {
      return;
    }
    if (!poll.allowChangeVote && poll.myVotes.length > 0) {
      return;
    }
    onVote(selectedOptions);
  };

  const totalVotes = poll.totalVotes;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{poll.question}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
            {poll.multiple ? (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200">
                Несколько ответов
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                Один ответ
              </span>
            )}
            {poll.allowChangeVote ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                Можно менять
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                Только один раз
              </span>
            )}
            {poll.isClosed ? (
              <span className="inline-flex items-center rounded-full bg-neutral-200 px-3 py-1 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100">
                Закрыт
              </span>
            ) : null}
            {!poll.isClosed && deadlineLabel ? (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
                До {deadlineLabel}
              </span>
            ) : null}
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              disabled={poll.isClosed || closePending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {closePending ? 'Закрываем...' : 'Закрыть опрос'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Удалить опрос?')) {
                  onDelete?.();
                }
              }}
              disabled={deletePending}
              className="rounded-lg border border-red-400 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:opacity-60 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              {deletePending ? 'Удаляем...' : 'Удалить'}
            </button>
          </div>
        ) : null}
      </header>

      <ul className="flex flex-col gap-3">
        {poll.options.map((option) => {
          const progress = totalVotes > 0 ? Math.round((option.votesCount / totalVotes) * 100) : 0;
          const isLeader = poll.leaderOptionIds.includes(option.id);
          const isChecked = selectedOptions.includes(option.id);
          return (
            <li
              key={option.id}
              className={`rounded-xl border p-4 transition ${
                isLeader
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                  : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950'
              }`}
            >
              <label className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {poll.multiple ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleOption(option.id)}
                        disabled={inputsDisabled}
                      />
                    ) : (
                      <input
                        type="radio"
                        name={`poll-${poll.id}`}
                        checked={isChecked}
                        onChange={() => handleSelectSingle(option.id)}
                        disabled={inputsDisabled}
                      />
                    )}
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {formatOptionLabel(poll.type, option)}
                    </span>
                  </div>
                  <span className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                    {option.votesCount} голосов
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800" role="presentation">
                  <div
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{ width: `${progress}%` }}
                    className={`h-2 rounded-full transition-all ${
                      isLeader ? 'bg-blue-500' : 'bg-neutral-400 dark:bg-neutral-600'
                    }`}
                  />
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-col gap-4 border-t border-dashed border-neutral-200 pt-4 text-sm text-neutral-700 dark:border-neutral-800 dark:text-neutral-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>Всего голосов: {totalVotes}</span>
          <span>Вы выбрали: {selectedSummary}</span>
        </div>
        <button
          type="button"
          onClick={handleVote}
          disabled={
            votePending ||
            isVotingDisabled ||
            (!poll.multiple && selectedOptions.length === 0) ||
            (!poll.allowChangeVote && poll.myVotes.length > 0)
          }
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60"
        >
          {isVotingDisabled ? 'Голосование недоступно' : votePending ? 'Сохраняем...' : 'Проголосовать'}
        </button>
      </footer>
    </article>
  );
};

export default PollCard;


