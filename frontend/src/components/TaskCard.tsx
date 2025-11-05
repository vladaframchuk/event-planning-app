'use client';

import Image from 'next/image';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type JSX,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { t } from '@/lib/i18n';
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

const TASK_STATUS_BADGE_CLASSES: Record<TaskStatus, string> = {
  todo: 'bg-[var(--color-accent-soft)] text-[var(--color-accent-primary)]',
  doing: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
  done: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
};

const TASK_STATUS_OPTIONS: TaskStatus[] = ['todo', 'doing', 'done'];

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
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
  const [isBrowser, setIsBrowser] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setIsBrowser(true);
  }, []);

  const assigneeDisplay = useMemo(() => {
    if (!assignee) {
      return null;
    }
    const { user } = assignee;
    const displayName = user.name?.trim() || user.email;
    const initials = computeInitials(user.name, user.email);
    return { displayName, initials, avatarUrl: user.avatarUrl };
  }, [assignee]);

  const statusLabels = useMemo<Record<TaskStatus, string>>(
    () => ({
      todo: t('event.board.status.todo'),
      doing: t('event.board.status.doing'),
      done: t('event.board.status.done'),
    }),
    [],
  );

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

  const handleDeleteConfirm = async () => {
    if (!onDelete) {
      return;
    }
    setDeleting(true);
    try {
      const succeeded = await onDelete();
      if (succeeded) {
        setDeleteDialogOpen(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (isDeleting) {
      return;
    }
    setDeleteDialogOpen(false);
  };

  const closeContextMenu = () => {
    setContextMenuOpen(false);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (!canDelete || isBusy) {
      return;
    }
    event.preventDefault();
    setContextMenuOpen(true);
  };

  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
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

  const titleClampStyle: CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  const descriptionClampStyle: CSSProperties = {
    display: '-webkit-box',
    WebkitLineClamp: 4,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  return (
    <>
      <div
        ref={cardRef}
        className="group relative flex h-[var(--card-h)] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-4 shadow-sm transition-transform duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:-translate-y-[1px]"
        onContextMenu={handleContextMenu}
        style={{ touchAction: 'manipulation' }}
      >
        <div className="flex flex-col gap-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]" style={titleClampStyle}>
              {task.title}
            </h3>
            <span
              className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-[0.2em] ${TASK_STATUS_BADGE_CLASSES[task.status]}`}
            >
              {statusLabels[task.status]}
            </span>
          </div>

          {task.description ? (
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]" style={descriptionClampStyle}>
              {task.description}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
            {startDate ? (
              <span>
                <span className="font-medium text-[var(--color-text-secondary)]">{t('event.board.card.start')}</span> {startDate}
              </span>
            ) : null}
            {dueDate ? (
              <span>
                <span className="font-medium text-[var(--color-text-secondary)]">{t('event.board.card.due')}</span> {dueDate}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
          {assigneeDisplay ? (
            <div className="flex min-w-0 items-center gap-2">
              {assigneeDisplay.avatarUrl ? (
                <Image
                  src={assigneeDisplay.avatarUrl}
                  alt={t('event.board.card.assigneeAvatar', { name: assigneeDisplay.displayName })}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                  sizes="36px"
                  unoptimized
                />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-primary)] text-xs font-semibold text-[var(--color-text-inverse)]"
                  aria-hidden="true"
                >
                  {assigneeDisplay.initials}
                </span>
              )}
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t('event.board.card.assignee')}</span>
                <span className="truncate text-xs text-[var(--color-text-secondary)]">{assigneeDisplay.displayName}</span>
              </div>
            </div>
          ) : canTake ? (
            <button
              type="button"
              onClick={handleTakeClick}
              disabled={isBusy}
              className="inline-flex min-h-[48px] items-center rounded-full bg-[var(--color-success)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-success)]/90 disabled:cursor-not-allowed disabled:bg-[var(--button-disabled-bg)] disabled:text-[var(--color-text-inverse)] disabled:opacity-100 disabled:shadow-none"
              aria-label={t('event.board.card.takeAria')}
            >
              {t('event.board.card.take')}
            </button>
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">{t('event.board.card.free')}</span>
          )}

          <label className="flex min-h-[48px] items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span>{t('event.board.card.statusLabel')}</span>
            <select
              value={task.status}
              onChange={handleStatusChange}
              disabled={isBusy}
              className="min-h-[48px] rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-soft)] disabled:opacity-60"
              aria-label={t('event.board.card.statusAria')}
            >
              {TASK_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isBrowser && isContextMenuOpen && canDelete
          ? createPortal(
              <div
                className="fixed inset-0 z-40 flex flex-col justify-end bg-neutral-950/60 px-4 pb-10 pt-14 backdrop-blur-sm sm:justify-center sm:pb-0 sm:pt-0"
                role="presentation"
                onClick={closeContextMenu}
              >
                <div
                  className="mx-auto w-full max-w-sm rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-6 shadow-[var(--shadow-lg)] focus:outline-none"
                  role="menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {t('event.board.card.deleteAction')}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    {t('event.board.card.deleteMessage')}
                  </p>
                  <div className="mt-6 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleDeleteFromMenu}
                      className="w-full rounded-2xl bg-[var(--color-error)] px-4 py-3 text-sm font-semibold text-white transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-error)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-error)]"
                      role="menuitem"
                    >
                      {t('event.board.card.deleteAction')}
                    </button>
                    <button
                      type="button"
                      onClick={closeContextMenu}
                      className="w-full rounded-2xl border border-[var(--color-border-subtle)] px-4 py-3 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-subtle)]"
                    >
                      {t('event.board.card.deleteCancel')}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        title={t('event.board.card.deleteTitle', { title: task.title })}
        message={t('event.board.card.deleteMessage')}
        confirmLabel={t('event.board.card.deleteConfirm')}
        cancelLabel={t('event.board.card.deleteCancel')}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        isProcessing={isDeleting}
      />
    </>
  );
};

export default TaskCard;
