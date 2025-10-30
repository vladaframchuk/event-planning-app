'use client';

import {
  type DragEvent,
  type JSX,
  type KeyboardEvent,
  useMemo,
} from 'react';

import type { BoardParticipant, Task, TaskList, TaskStatus } from '@/types/task';

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
  participants: Map<number, BoardParticipant>;
  taskPermissions: Map<number, { canTake: boolean; canChangeStatus: boolean }>;
  showMyTasksOnly: boolean;
  myParticipantId: number | null;
  isTaskPending: (taskId: number) => boolean;
  onTakeTask: (taskId: number) => void;
  onUpdateTaskStatus: (taskId: number, status: TaskStatus) => void;
  onStatusChangeDenied: () => void;
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
  participants,
  taskPermissions,
  showMyTasksOnly,
  myParticipantId,
  isTaskPending,
  onTakeTask,
  onUpdateTaskStatus,
  onStatusChangeDenied,
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

  const sectionClasses = [
    'flex w-full min-w-[260px] max-w-xs flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm transition dark:border-neutral-700 dark:bg-neutral-900',
  ];
  if (isListDragging) {
    sectionClasses.push('opacity-60', 'dragging');
  }
  if (isListDropTarget) {
    sectionClasses.push('ring-2', 'ring-blue-400');
  }

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

  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const handleTaskKeyDown = (task: Task) => (event: KeyboardEvent<HTMLElement>) => {
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
    <section
      className={sectionClasses.join(' ')}
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
          <button
            type="button"
            onClick={() => onAddTask(list)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60"
            aria-label={`Добавить задачу в колонку ${list.title}`}
            disabled={isSyncing}
          >
            +
          </button>
        ) : null}
      </header>

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
                    isBusy={isTaskPending(task.id)}
                    onTake={() => onTakeTask(task.id)}
                    onStatusChange={(status) => onUpdateTaskStatus(task.id, status)}
                    onStatusChangeDenied={onStatusChangeDenied}
                  />
                </article>
              </div>
            );
          })
        )}
        {dropIndex !== null && dropIndex >= tasks.length && !dropIndicatorRendered ? dropIndicator : null}
      </div>
    </section>
  );
};

export default TaskListColumn;
