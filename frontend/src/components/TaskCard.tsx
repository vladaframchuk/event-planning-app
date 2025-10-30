import Image from 'next/image';
import { useMemo, type ChangeEvent, type JSX } from 'react';

import type { BoardParticipant, Task, TaskStatus } from '@/types/task';

type TaskCardProps = {
  task: Task;
  assignee: BoardParticipant | null;
  canTake: boolean;
  canChangeStatus: boolean;
  isBusy: boolean;
  onTake: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onStatusChangeDenied: () => void;
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Нужно сделать',
  doing: 'В работе',
  done: 'Готово',
};

const TASK_STATUS_OPTIONS: TaskStatus[] = ['todo', 'doing', 'done'];

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return dateTimeFormatter.format(date);
};

const computeInitials = (name: string | null, email: string): string => {
  const normalizedName = name?.trim() ?? '';
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/u).slice(0, 2);
    const initials = parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
    if (initials) {
      return initials;
    }
  }
  const emailInitial = email.trim()[0];
  return emailInitial ? emailInitial.toUpperCase() : 'U';
};

const TaskCard = ({
  task,
  assignee,
  canTake,
  canChangeStatus,
  isBusy,
  onTake,
  onStatusChange,
  onStatusChangeDenied,
}: TaskCardProps): JSX.Element => {
  const startDate = formatDate(task.startAt);
  const dueDate = formatDate(task.dueAt);

  const assigneeDisplay = useMemo(() => {
    if (!assignee) {
      return null;
    }
    const { user } = assignee;
    const displayName = user.name?.trim() || user.email;
    const initials = computeInitials(user.name, user.email);
    return { displayName, initials, avatarUrl: user.avatarUrl };
  }, [assignee]);

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextStatus = event.target.value as TaskStatus;
    if (isBusy) {
      event.preventDefault();
      event.target.value = task.status;
      return;
    }
    if (!canChangeStatus) {
      event.preventDefault();
      event.target.value = task.status;
      onStatusChangeDenied();
      return;
    }
    if (nextStatus !== task.status) {
      onStatusChange(nextStatus);
    }
  };

  const handleTakeClick = () => {
    if (!canTake || isBusy) {
      return;
    }
    onTake();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{task.title}</h3>
        <span className="inline-flex min-w-[88px] justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {TASK_STATUS_LABELS[task.status]}
        </span>
      </div>

      {task.description ? (
        <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{task.description}</p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
        {startDate ? (
          <span>
            <span className="font-medium text-neutral-600 dark:text-neutral-300">Начало:</span> {startDate}
          </span>
        ) : null}
        {dueDate ? (
          <span>
            <span className="font-medium text-neutral-600 dark:text-neutral-300">Дедлайн:</span> {dueDate}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {assigneeDisplay ? (
          <div className="flex items-center gap-2">
            {assigneeDisplay.avatarUrl ? (
              <Image
                src={assigneeDisplay.avatarUrl}
                alt={"Ответственный " + assigneeDisplay.displayName}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                sizes="32px"
                unoptimized
              />
            ) : (
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white dark:bg-blue-500"
                aria-hidden="true"
              >
                {assigneeDisplay.initials}
              </span>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Ответственный</span>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">{assigneeDisplay.displayName}</span>
            </div>
          </div>
        ) : canTake ? (
          <button
            type="button"
            onClick={handleTakeClick}
            disabled={isBusy}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:opacity-60"
            aria-label="Взять задачу на себя"
          >
            Беру на себя
          </button>
        ) : (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Ответственный не назначен</span>
        )}

        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <span>Статус:</span>
          <select
            value={task.status}
            onChange={handleStatusChange}
            disabled={isBusy}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            aria-label="Изменить статус задачи"
          >
            {TASK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

export default TaskCard;
