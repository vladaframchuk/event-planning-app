import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type JSX, type MouseEvent } from 'react';

import type { BoardParticipant, Task, TaskStatus } from '@/types/task';
import ConfirmDialog from './ConfirmDialog';

type TaskCardProps = {
  task: Task;
  assignee: BoardParticipant | null;
  canTake: boolean;
  canChangeStatus: boolean;
  isBusy: boolean;
  onTake: () => Promise<boolean>;
  onStatusChange: (status: TaskStatus) => Promise<boolean>;
  onStatusChangeDenied: () => void;
  canDelete: boolean;
  onDelete?: () => Promise<boolean>;
  onTaskChanged?: () => void;
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'В очереди',
  doing: 'В работе',
  done: 'Готово',
};

const TASK_STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  todo:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  doing:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  done:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
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
  canDelete,
  onDelete,
  onTaskChanged,
}: TaskCardProps): JSX.Element => {
  const startDate = formatDate(task.startAt);
  const dueDate = formatDate(task.dueAt);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [isContextMenuOpen, setContextMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const assigneeDisplay = useMemo(() => {
    if (!assignee) {
      return null;
    }
    const { user } = assignee;
    const displayName = user.name?.trim() || user.email;
    const initials = computeInitials(user.name, user.email);
    return { displayName, initials, avatarUrl: user.avatarUrl };
  }, [assignee]);

  const handleStatusChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const selectElement = event.currentTarget;
    const nextStatus = selectElement.value as TaskStatus;
    if (isBusy) {
      event.preventDefault();
      selectElement.value = task.status;
      return;
    }
    if (!canChangeStatus) {
      event.preventDefault();
      selectElement.value = task.status;
      onStatusChangeDenied();
      return;
    }
    if (nextStatus === task.status) {
      return;
    }
    const succeeded = await onStatusChange(nextStatus).catch(() => false);
    if (!succeeded) {
      selectElement.value = task.status;
      return;
    }
    onTaskChanged?.();
  };

  const handleTakeClick = async () => {
    if (!canTake || isBusy) {
      return;
    }
    const succeeded = await onTake().catch(() => false);
    if (succeeded) {
      onTaskChanged?.();
    }
  };

  const handleDeleteCancel = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) {
      return;
    }
    setDeleting(true);
    const succeeded = await onDelete().catch(() => false);
    setDeleting(false);
    if (succeeded) {
      setDeleteDialogOpen(false);
      onTaskChanged?.();
    }
  };

  const closeContextMenu = () => {
    setContextMenuOpen(false);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!canDelete) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isBusy) {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    setMenuPosition({
      top: event.clientY - rect.top,
      left: event.clientX - rect.left,
    });
    setContextMenuOpen(true);
  };

  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const menuNode = menuRef.current;
      if (menuNode && menuNode.contains(event.target as Node)) {
        return;
      }
      const cardNode = cardRef.current;
      if (cardNode && cardNode.contains(event.target as Node)) {
        // Клик по карточке за пределами меню — просто закрываем меню.
        setContextMenuOpen(false);
        return;
      }
      setContextMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isContextMenuOpen]);

  const handleDeleteFromMenu = () => {
    closeContextMenu();
    if (!canDelete || isBusy || isDeleting) {
      return;
    }
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <div
        ref={cardRef}
        className="relative flex flex-col gap-3"
        onContextMenu={handleContextMenu}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{task.title}</h3>
          <span
            className={`inline-flex min-w-[88px] justify-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TASK_STATUS_BADGE_CLASSES[task.status]}`}
          >
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
      {isContextMenuOpen && canDelete ? (
        <div
          ref={menuRef}
          className="absolute z-20 min-w-[160px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
        >
          <button
            type="button"
            onClick={handleDeleteFromMenu}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-500/10"
            role="menuitem"
          >
            Удалить задачу
          </button>
        </div>
      ) : null}
      </div>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        title={`Удалить задачу "${task.title}"?`}
        message="Действие необратимо."
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isProcessing={isDeleting}
      />
    </>
  );
};

export default TaskCard;
