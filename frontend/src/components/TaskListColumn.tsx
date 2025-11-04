'use client';

import {
  type DragEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { t } from '@/lib/i18n';
import type { BoardParticipant, Task, TaskList, TaskStatus } from '@/types/task';

import ConfirmDialog from './ConfirmDialog';
import TaskCard from './TaskCard';

type DragMode = 'mouse' | 'keyboard';

type DragContext =
  | { type: 'list'; id: number; mode: DragMode }
  | { type: 'task'; id: number; listId: number; mode: DragMode }
  | null;

type DropTaskIndicator = { listId: number | null; index: number | null };

type TaskListColumnProps = {
  list: TaskList & { tasks: Task[] };
  canManage: boolean;
  isSyncing: boolean;
  dragContext: DragContext;
  dropListId: number | null;
  dropTaskIndicator: DropTaskIndicator;
  onAddTask: (list: TaskList & { tasks: Task[] }) => void;
  onListDragStart: (listId: number, mode: DragMode) => void;
  onListDragOver: (listId: number) => void;
  onListDrop: (listId: number) => void;
  onListDragEnd: () => void;
  onListKeyboardMove: (listId: number, direction: 'left' | 'right') => void;
  onTaskDragStart: (listId: number, taskId: number, mode: DragMode) => void;
  onTaskDragOver: (listId: number, targetIndex: number) => void;
  onTaskDrop: (listId: number, targetIndex: number) => void;
  onTaskDragEnd: () => void;
  onTaskKeyboardMove: (listId: number, taskId: number, direction: 'up' | 'down' | 'left' | 'right') => void;
  onCancelDrag: () => void;
  onDeleteTask: (listId: number, taskId: number) => Promise<boolean>;
  onDeleteTaskList: (listId: number) => Promise<boolean>;
  participants: Map<number, BoardParticipant>;
  taskPermissions: Map<number, { canTake: boolean; canChangeStatus: boolean }>;
  showMyTasksOnly: boolean;
  myParticipantId: number | null;
  isTaskPending: (taskId: number) => boolean;
  onTakeTask: (taskId: number) => Promise<boolean>;
  onUpdateTaskStatus: (taskId: number, status: TaskStatus) => Promise<boolean>;
  onStatusChangeDenied: () => void;
  onTaskChanged?: () => void;
};

const DRAG_TYPE_LIST = 'application/x-event-taskboard-list';
const DRAG_TYPE_TASK = 'application/x-event-taskboard-task';

const TaskListColumn = ({
  list,
  canManage,
  isSyncing,
  dragContext,
  dropListId,
  dropTaskIndicator,
  onAddTask,
  onListDragStart,
  onListDragOver,
  onListDrop,
  onListDragEnd,
  onListKeyboardMove,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  onTaskDragEnd,
  onTaskKeyboardMove,
  onCancelDrag,
  onDeleteTask,
  onDeleteTaskList,
  participants,
  taskPermissions,
  showMyTasksOnly,
  myParticipantId,
  isTaskPending,
  onTakeTask,
  onUpdateTaskStatus,
  onStatusChangeDenied,
  onTaskChanged,
}: TaskListColumnProps): JSX.Element => {
  const tasks = useMemo(() => list.tasks, [list.tasks]);
  const filteredTasks = useMemo(
    () =>
      tasks
        .map<{ task: Task; index: number }>((task, index) => ({ task, index }))
        .filter(({ task }) => {
          if (!showMyTasksOnly || myParticipantId === null) {
            return true;
          }
          return task.assignee === myParticipantId;
        }),
    [tasks, showMyTasksOnly, myParticipantId],
  );

  const isListDragging = dragContext?.type === 'list' && dragContext.id === list.id;
  const isListDropTarget = dragContext?.type === 'list' && dropListId === list.id && dragContext.id !== list.id;
  const dropIndex = dropTaskIndicator.listId === list.id ? dropTaskIndicator.index : null;

  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeletingList, setDeletingList] = useState(false);
  const [isContextMenuOpen, setContextMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const columnRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const menuNode = menuRef.current;
      if (menuNode && menuNode.contains(event.target as Node)) {
        return;
      }
      const columnNode = columnRef.current;
      if (columnNode && columnNode.contains(event.target as Node)) {
        setContextMenuOpen(false);
        return;
      }
      setContextMenuOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
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

  const closeContextMenu = () => {
    setContextMenuOpen(false);
  };

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!canManage) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (isSyncing || isDeletingList) {
      return;
    }
    const columnNode = columnRef.current;
    if (!columnNode) {
      return;
    }
    const rect = columnNode.getBoundingClientRect();
    setMenuPosition({
      top: event.clientY - rect.top,
      left: event.clientX - rect.left,
    });
    setContextMenuOpen(true);
  };

  const handleDeleteListFromMenu = () => {
    closeContextMenu();
    if (!canManage || isSyncing || isDeletingList) {
      return;
    }
    setDeleteDialogOpen(true);
  };

  const sectionClasses = [
    'relative flex w-[var(--category-width)] min-h-[200px] flex-col overflow-hidden rounded-3xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] shadow-sm transition-[height,background-color,border-color,box-shadow] duration-300 ease-in-out',
  ];
  if (isListDragging) {
    sectionClasses.push('opacity-60', 'dragging');
  }
  if (isListDropTarget) {
    sectionClasses.push('outline', 'outline-2', 'outline-[var(--color-accent-primary)]');
  }

  const handleDeleteListCancel = () => {
    if (isDeletingList) {
      return;
    }
    closeContextMenu();
    setDeleteDialogOpen(false);
  };

  const handleDeleteListConfirm = async () => {
    if (isDeletingList) {
      return;
    }
    closeContextMenu();
    setDeletingList(true);
    const succeeded = await onDeleteTaskList(list.id).catch(() => false);
    setDeletingList(false);
    if (succeeded) {
      setDeleteDialogOpen(false);
      onTaskChanged?.();
    }
  };

  const handleHeaderDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || isSyncing) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(DRAG_TYPE_LIST, String(list.id));
    event.dataTransfer.effectAllowed = 'move';
    onListDragStart(list.id, 'mouse');
  };

  const handleHeaderDragEnd = () => {
    onListDragEnd();
  };

  const handleSectionDragOver = (event: DragEvent<HTMLElement>) => {
    if (!canManage || dragContext?.type !== 'list' || dragContext.id === list.id) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onListDragOver(list.id);
  };

  const handleSectionDrop = (event: DragEvent<HTMLElement>) => {
    if (!canManage || dragContext?.type !== 'list' || dragContext.id === list.id) {
      return;
    }
    event.preventDefault();
    onListDrop(list.id);
  };

  const handleHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canManage || isSyncing) {
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onListKeyboardMove(list.id, event.key === 'ArrowLeft' ? 'left' : 'right');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelDrag();
    }
  };

  const handleTasksContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || dragContext?.type !== 'task') {
      return;
    }
    const targetElement = event.target as HTMLElement | null;
    if (targetElement?.closest('[data-task-card="true"]')) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const targetIndex = resolveContainerDropIndex(event);
    onTaskDragOver(list.id, targetIndex);
  };

  const handleTasksContainerDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canManage || dragContext?.type !== 'task') {
      return;
    }
    const targetElement = event.target as HTMLElement | null;
    if (targetElement?.closest('[data-task-card="true"]')) {
      return;
    }
    event.preventDefault();
    const targetIndex = resolveContainerDropIndex(event);
    onTaskDrop(list.id, targetIndex);
  };

  const handleTaskDragStart = (task: Task) => (event: DragEvent<HTMLElement>) => {
    if (!canManage || isSyncing) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(DRAG_TYPE_TASK, JSON.stringify({ taskId: task.id, listId: list.id }));
    event.dataTransfer.effectAllowed = 'move';
    onTaskDragStart(list.id, task.id, 'mouse');
  };

  const handleTaskDragOver = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!canManage || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onTaskDragOver(list.id, index);
  };

  const handleTaskDrop = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!canManage || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    onTaskDrop(list.id, index);
  };

  const handleTaskKeyDown = (task: Task) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!canManage || isSyncing) {
      return;
    }
    if (event.key === ' ' || event.key === 'SpaceBar') {
      event.preventDefault();
      const isGrabbing = dragContext?.type === 'task' && dragContext.id === task.id;
      if (isGrabbing) {
        onTaskDragEnd();
      } else {
        onTaskDragStart(list.id, task.id, 'keyboard');
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelDrag();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onTaskKeyboardMove(list.id, task.id, event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      onTaskKeyboardMove(list.id, task.id, event.key === 'ArrowLeft' ? 'left' : 'right');
    }
  };

  const visibleTaskCount = filteredTasks.length;
  const totalTaskCount = tasks.length;
  const taskCountLabel =
    showMyTasksOnly && myParticipantId !== null && visibleTaskCount !== totalTaskCount
      ? t('event.board.taskCount.filtered', { visible: visibleTaskCount, total: totalTaskCount })
      : t('event.board.taskCount.all', { total: totalTaskCount });

  const baseEmptyMessage = t('event.board.empty');
  const filteredEmptyMessage = t('event.board.empty.filtered');
  const emptyMessage =
    totalTaskCount === 0 || !showMyTasksOnly || myParticipantId === null ? baseEmptyMessage : filteredEmptyMessage;

  const dropIndicator = (
    <div
      className="my-1 h-2 w-full rounded border-2 border-dashed border-[var(--color-accent-primary)]"
      aria-hidden="true"
    />
  );

  let dropIndicatorRendered = false;

  const showEmptyIndicatorBefore =
    visibleTaskCount === 0 && dropIndex !== null && dropIndex <= 0;
  const showEmptyIndicatorAfter =
    visibleTaskCount === 0 && dropIndex !== null && dropIndex > 0 && dropIndex >= tasks.length;

  if (showEmptyIndicatorBefore || showEmptyIndicatorAfter) {
    dropIndicatorRendered = true;
  }

  const resolveContainerDropIndex = (event: DragEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    if (!Number.isFinite(offsetY) || rect.height <= 0) {
      return dropTaskIndicator.listId === list.id && dropTaskIndicator.index !== null
        ? dropTaskIndicator.index
        : tasks.length;
    }
    if (tasks.length === 0) {
      return 0;
    }
    const ratio = offsetY / rect.height;
    if (ratio <= 0.25) {
      return 0;
    }
    if (ratio >= 0.75) {
      return tasks.length;
    }
    return dropTaskIndicator.listId === list.id && dropTaskIndicator.index !== null
      ? dropTaskIndicator.index
      : tasks.length;
  };

  return (
    <>
      <section
        ref={columnRef}
        className={sectionClasses.join(' ')}
        onContextMenu={handleContextMenu}
        onDragOver={handleSectionDragOver}
        onDrop={handleSectionDrop}
        aria-dropeffect={dragContext?.type === 'list' ? 'move' : undefined}
      >
      <header className="flex items-center justify-between gap-3 rounded-t-3xl bg-[var(--color-surface-muted)] px-5 py-4">
        <div
          className="flex flex-1 cursor-grab select-none flex-col gap-1 focus:outline-none"
          draggable={canManage && !isSyncing}
          onDragStart={handleHeaderDragStart}
          onDragEnd={handleHeaderDragEnd}
          tabIndex={canManage ? 0 : undefined}
          role={canManage ? 'button' : undefined}
          aria-grabbed={isListDragging}
          aria-dropeffect={dragContext?.type === 'list' ? 'move' : undefined}
          onKeyDown={handleHeaderKeyDown}
        >
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{list.title}</h2>
          <span className="text-xs text-[var(--color-text-muted)]">{taskCountLabel}</span>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAddTask(list)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-primary)] text-sm font-semibold text-[var(--color-text-inverse)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-accent-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={t('event.board.aria.addTask', { title: list.title })}
              disabled={isSyncing || isDeletingList}
            >
              +
            </button>
          </div>
        ) : null}
      </header>
      {isContextMenuOpen && canManage ? (
        <div
          ref={menuRef}
          className="absolute z-30 min-w-[200px] rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] py-1 shadow-[var(--shadow-sm)] focus:outline-none"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
        >
          <button
            type="button"
            onClick={handleDeleteListFromMenu}
            className="block w-full px-4 py-2 text-left text-sm text-[var(--color-error)] transition-colors duration-[var(--transition-fast)] ease-[var(--easing-standard)] hover:bg-[var(--color-error-soft)]"
            role="menuitem"
          >
            {t('event.board.action.deleteColumn')}
          </button>
        </div>
      ) : null}

      <div
        className="flex w-full flex-col gap-4 overflow-visible px-4 pb-4 pt-3"
        role="list"
        aria-label={t('event.board.aria.list', { title: list.title })}
        aria-dropeffect={dragContext?.type === 'task' ? 'move' : undefined}
        onDragOver={handleTasksContainerDragOver}
        onDrop={handleTasksContainerDrop}
      >
        {visibleTaskCount === 0 ? (
          <>
            {showEmptyIndicatorBefore ? dropIndicator : null}
            <p className="rounded-2xl border border-dashed border-[var(--color-border-subtle)] bg-[var(--color-background-elevated)] p-5 text-sm text-[var(--color-text-secondary)]">
              {emptyMessage}
            </p>
            {showEmptyIndicatorAfter ? dropIndicator : null}
          </>
        ) : (
          filteredTasks.map(({ task, index: originalIndex }) => {
            const shouldRenderDropIndicator =
              dropIndex !== null && !dropIndicatorRendered && dropIndex <= originalIndex;
            if (shouldRenderDropIndicator) {
              dropIndicatorRendered = true;
            }

            const isTaskDragging = dragContext?.type === 'task' && dragContext.id === task.id;
            const permission = taskPermissions.get(task.id) ?? { canTake: false, canChangeStatus: false };
            const assigneeParticipant =
              task.assignee !== null ? participants.get(task.assignee) ?? null : null;
            const taskClasses = [
              'flex w-full justify-center',
            ];
            if (isTaskDragging) {
              taskClasses.push('opacity-60', 'dragging');
            }

            return (
              <div key={task.id}>
                {shouldRenderDropIndicator ? dropIndicator : null}
                <article
                  data-task-card="true"
                  role="listitem"
                  tabIndex={0}
                  className={taskClasses.join(' ')}
                  draggable={canManage && !isSyncing}
                  onDragStart={handleTaskDragStart(task)}
                  onDragOver={handleTaskDragOver(originalIndex)}
                  onDrop={handleTaskDrop(originalIndex)}
                  onDragEnd={onTaskDragEnd}
                  aria-grabbed={isTaskDragging}
                  onKeyDown={handleTaskKeyDown(task)}
                >
                  <TaskCard
                    task={task}
                    assignee={assigneeParticipant}
                    canTake={permission.canTake}
                    canChangeStatus={permission.canChangeStatus}
                    canDelete={canManage}
                    isBusy={isTaskPending(task.id)}
                    onTake={() => onTakeTask(task.id)}
                    onDelete={() => onDeleteTask(list.id, task.id)}
                    onStatusChange={(status) => onUpdateTaskStatus(task.id, status)}
                    onStatusChangeDenied={onStatusChangeDenied}
                    onTaskChanged={onTaskChanged}
                  />
                </article>
              </div>
            );
          })
        )}
        {dropIndex !== null && dropIndex >= tasks.length && !dropIndicatorRendered ? dropIndicator : null}
      </div>
    </section>
    <ConfirmDialog
      open={isDeleteDialogOpen}
      title={t('event.board.dialog.deleteTitle', { title: list.title })}
      message={t('event.board.dialog.deleteDescription')}
      confirmLabel={t('event.board.dialog.confirm')}
      cancelLabel={t('event.board.dialog.cancel')}
      onConfirm={handleDeleteListConfirm}
      onCancel={handleDeleteListCancel}
      isProcessing={isDeletingList}
    />
  </>
  );
};

export default TaskListColumn;


