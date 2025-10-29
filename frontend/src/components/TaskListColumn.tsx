'use client';

import {
  type DragEvent,
  type JSX,
  type KeyboardEvent,
  useMemo,
} from 'react';

import type { Task, TaskList } from '@/types/task';

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
};

const DRAG_TYPE_LIST = 'application/x-event-taskboard-list';
const DRAG_TYPE_TASK = 'application/x-event-taskboard-task';

const taskDateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
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
  return taskDateTimeFormatter.format(date);
};

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
}: TaskListColumnProps): JSX.Element => {
  const tasks = useMemo(() => list.tasks, [list.tasks]);
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
    const isActive = dragContext?.type === 'list' && dragContext.id === list.id;
    if ((event.key === ' ' || event.key === 'Enter') && !event.shiftKey) {
      event.preventDefault();
      if (isActive) {
        onCancelDrag();
      } else {
        onListDragStart(list.id, 'keyboard');
      }
      return;
    }
    if (!isActive) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelDrag();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onListKeyboardMove(list.id, event.key === 'ArrowLeft' ? 'left' : 'right');
    }
  };

  const handleTasksContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isOwner || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    onTaskDragOver(list.id, tasks.length);
  };

  const handleTasksContainerDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isOwner || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onTaskDrop(list.id, tasks.length);
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
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    onTaskDragOver(list.id, index);
  };

  const handleTaskDrop = (index: number) => (event: DragEvent<HTMLElement>) => {
    if (!isOwner || dragContext?.type !== 'task') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onTaskDrop(list.id, index);
  };

  const handleTaskDragEnd = () => {
    onTaskDragEnd();
  };

  const handleTaskKeyDown = (task: Task) => (event: KeyboardEvent<HTMLElement>) => {
    if (!isOwner || isSyncing) {
      return;
    }
    const isActive = dragContext?.type === 'task' && dragContext.id === task.id;
    if ((event.key === ' ' || event.key === 'Enter') && !event.shiftKey) {
      event.preventDefault();
      if (isActive) {
        onTaskDragEnd();
      } else {
        onTaskDragStart(list.id, task.id, 'keyboard');
      }
      return;
    }
    if (!isActive) {
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
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Задач: {tasks.length}</span>
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
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Задач пока нет. Перетащите карточку или создайте новую.
          </p>
        ) : (
          tasks.map((task, index) => {
            const isTaskDragging = dragContext?.type === 'task' && dragContext.id === task.id;
            const showDropIndicator = dropIndex === index;
            const taskClasses = [
              'flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-sm transition hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200',
            ];
            if (isTaskDragging) {
              taskClasses.push('opacity-60', 'dragging');
            }
            return (
              <div key={task.id}>
                {showDropIndicator ? (
                  <div className="mb-2 h-2 rounded border-2 border-dashed border-blue-400" aria-hidden="true" />
                ) : null}
                <article
                  role="listitem"
                  tabIndex={0}
                  className={taskClasses.join(' ')}
                  draggable={isOwner && !isSyncing}
                  onDragStart={handleTaskDragStart(task)}
                  onDragOver={handleTaskDragOver(index)}
                  onDrop={handleTaskDrop(index)}
                  onDragEnd={handleTaskDragEnd}
                  aria-grabbed={isTaskDragging}
                  onKeyDown={handleTaskKeyDown(task)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{task.title}</h3>
                    <span className="inline-flex min-w-[72px] justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {task.status}
                    </span>
                  </div>
                  {task.description ? (
                    <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{task.description}</p>
                  ) : null}
                  <ul className="flex flex-col gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatDate(task.startAt) ? (
                      <li>
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Начало:</span>{' '}
                        {formatDate(task.startAt)}
                      </li>
                    ) : null}
                    {formatDate(task.dueAt) ? (
                      <li>
                        <span className="font-medium text-neutral-600 dark:text-neutral-300">Дедлайн:</span>{' '}
                        {formatDate(task.dueAt)}
                      </li>
                    ) : null}
                  </ul>
                </article>
              </div>
            );
          })
        )}
        {dropIndex === tasks.length ? (
          <div className="mt-2 h-2 rounded border-2 border-dashed border-blue-400" aria-hidden="true" />
        ) : null}
      </div>
    </section>
  );
};

export default TaskListColumn;
