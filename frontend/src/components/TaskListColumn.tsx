'use client';

import { type JSX, useMemo } from 'react';

import type { Task, TaskList } from '@/types/task';

type TaskListColumnProps = {
  list: TaskList & { tasks: Task[] };
  isOwner: boolean;
  onAddTask: (list: TaskList & { tasks: Task[] }) => void;
};

const formatDate = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const TaskListColumn = ({ list, isOwner, onAddTask }: TaskListColumnProps): JSX.Element => {
  const tasks = useMemo(() => list.tasks, [list.tasks]);

  return (
    <section className="flex w-full min-w-[260px] max-w-xs flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-3 rounded-t-2xl bg-neutral-50 px-4 py-3 dark:bg-neutral-800">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{list.title}</h2>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Задач: {tasks.length}</span>
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={() => onAddTask(list)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            aria-label={`Добавить задачу в список ${list.title}`}
          >
            +
          </button>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4" role="list" aria-label={`Задачи списка ${list.title}`}>
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Нет задач. Нажмите «+ задача»
          </p>
        ) : (
          tasks.map((task) => (
            <article
              key={task.id}
              role="listitem"
              tabIndex={0}
              className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700 shadow-sm transition hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"
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
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">Старт:</span>{' '}
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
          ))
        )}
      </div>
    </section>
  );
};

export default TaskListColumn;
