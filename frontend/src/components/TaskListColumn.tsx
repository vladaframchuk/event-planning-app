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
  isOwner: boolean;
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
  isOwner,
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
    if (!isOwner) {
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
    if (!isOwner || isSyncing || isDeletingList) {
      return;
    }
    setDeleteDialogOpen(true);
  };

  const sectionClasses = [
    'relative flex w-full min-w-[260px] max-w-xs flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900',
  ];
  if (isListDragging) {
    sectionClasses.push('opacity-60', 'dragging');
  }
  if (isListDropTarget) {
    sectionClasses.push('ring-2', 'ring-blue-400');
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
    if (!isOwner || isSyncing) {
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
    if (!isOwner || dragContext?.type !== 'list' || dragContext.id === list.id) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onListDragOver(list.id);
  };

  const handleSectionDrop = (event: DragEvent<HTMLElement>) => {
    if (!isOwner || dragContext?.type !== 'list' || dragContext.id === list.id) {
      return;
    }
    event.preventDefault();
    onListDrop(list.id);
  };

  const handleHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isOwner || isSyncing) {
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
    if (!isOwner || dragContext?.type !== 'task') {
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
    if (!isOwner || dragContext?.type !== 'task') {
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
    if (!isOwner || isSyncing) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(DRAG_TYPE_TASK, JSON.stringify({ taskId: task.id, listId: list.id }));
    event.dataTransfer.effectAllowed = 'move';
    onTaskDragStart(list.id, task.id, 'mouse');
  };

  const handleTaskDragOver = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!isOwner || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onTaskDragOver(list.id, index);
  };

  const handleTaskDrop = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!isOwner || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    onTaskDrop(list.id, index);
  };

  const handleTaskKeyDown = (task: Task) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isOwner || isSyncing) {
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
      ? `Задач: ${visibleTaskCount} / ${totalTaskCount}`
      : `Задач: ${totalTaskCount}`;

  const baseEmptyMessage = 'Задач пока нет. Перетащите карточку или создайте новую.';
  const filteredEmptyMessage = 'Для вас пока нет задач в этой колонке.';
  const emptyMessage =
    totalTaskCount === 0 || !showMyTasksOnly || myParticipantId === null ? baseEmptyMessage : filteredEmptyMessage;

  const dropIndicator = (
    <div className="my-1 h-2 rounded border-2 border-dashed border-blue-400" aria-hidden="true" />
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
      <header className="flex items-center justify-between gap-3 rounded-t-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
        <div
          className="flex flex-1 cursor-grab select-none flex-col gap-1 focus:outline-none"
          draggable={isOwner && !isSyncing}
          onDragStart={handleHeaderDragStart}
          onDragEnd={handleHeaderDragEnd}
          tabIndex={isOwner ? 0 : undefined}
          role={isOwner ? 'button' : undefined}
          aria-grabbed={isListDragging}
          aria-dropeffect={dragContext?.type === 'list' ? 'move' : undefined}
          onKeyDown={handleHeaderKeyDown}
        >
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{list.title}</h2>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{taskCountLabel}</span>
        </div>
        {isOwner ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAddTask(list)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Добавить задачу в колонку ${list.title}`}
              disabled={isSyncing || isDeletingList}
            >
              +
            </button>
          </div>
        ) : null}
      </header>
      {isContextMenuOpen && isOwner ? (
        <div
          ref={menuRef}
          className="absolute z-30 min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          role="menu"
        >
          <button
            type="button"
            onClick={handleDeleteListFromMenu}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-500/10"
            role="menuitem"
          >
            Удалить категорию
          </button>
        </div>
      ) : null}

      <div
        className="flex flex-1 flex-col gap-3 p-4"
        role="list"
        aria-label={`Задачи колонки ${list.title}`}
        aria-dropeffect={dragContext?.type === 'task' ? 'move' : undefined}
        onDragOver={handleTasksContainerDragOver}
        onDrop={handleTasksContainerDrop}
      >
        {visibleTaskCount === 0 ? (
          <>
            {showEmptyIndicatorBefore ? dropIndicator : null}
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
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
              'flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-sm transition hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200',
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
                  draggable={isOwner && !isSyncing}
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
                    canDelete={isOwner}
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
      title={`Удалить категорию "${list.title}"?`}
      message="Будут также удалены все задачи этой категории. Действие необратимо."
      confirmLabel="Удалить"
      cancelLabel="Отмена"
      onConfirm={handleDeleteListConfirm}
      onCancel={handleDeleteListCancel}
      isProcessing={isDeletingList}
    />
  </>
  );
};

export default TaskListColumn;
