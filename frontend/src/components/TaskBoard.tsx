'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  forwardRef,
  type FormEvent,
  type JSX,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';

import { createList, createTask, getBoard } from '@/lib/tasksApi';
import type { Board } from '@/types/task';

import TaskCreateDialog from './TaskCreateDialog';
import TaskListColumn from './TaskListColumn';

type TaskBoardProps = {
  eventId: number;
  showInlineAddListButton?: boolean;
};

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

type TaskCreatePayload = {
  title: string;
  description?: string;
  startAt?: string | null;
  dueAt?: string | null;
};

export type TaskBoardHandle = {
  openCreateListForm: () => void;
  closeCreateListForm: () => void;
};

const SkeletonColumn = (): JSX.Element => (
  <div className="flex w-full min-w-[260px] max-w-xs flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
    <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
    <div className="mt-4 flex flex-col gap-3">
      <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
    </div>
  </div>
);

const TaskBoard = forwardRef<TaskBoardHandle, TaskBoardProps>(({ eventId, showInlineAddListButton = true }, ref) => {
  const queryClient = useQueryClient();
  const [isListFormVisible, setListFormVisible] = useState(false);
  const [listTitle, setListTitle] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isTaskDialogOpen, setTaskDialogOpen] = useState(false);
  const [activeList, setActiveList] = useState<Board['lists'][number] | null>(null);
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);

  const boardQueryKey = useMemo(() => ['events', eventId, 'board'], [eventId]);

  const boardQuery = useQuery<Board, Error>({
    queryKey: boardQueryKey,
    queryFn: () => getBoard(eventId),
  });

  const openListForm = useCallback(() => {
    setListFormVisible(true);
    setListError(null);
  }, []);

  const closeListForm = useCallback(() => {
    setListFormVisible(false);
    setListTitle('');
    setListError(null);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      openCreateListForm: openListForm,
      closeCreateListForm: closeListForm,
    }),
    [closeListForm, openListForm],
  );

  const createListMutation = useMutation({
    mutationFn: (title: string) => createList(eventId, { title }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardQueryKey });
      setToast({ id: Date.now(), message: 'Колонка успешно создана.', type: 'success' });
      closeListForm();
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ listId, payload }: { listId: number; payload: TaskCreatePayload }) =>
      createTask({
        list: listId,
        title: payload.title,
        description: payload.description,
        startAt: payload.startAt,
        dueAt: payload.dueAt,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardQueryKey });
      setToast({ id: Date.now(), message: 'Задача создана.', type: 'success' });
      setTaskDialogOpen(false);
      setActiveList(null);
      setTaskDialogError(null);
    },
  });

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleListSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!listTitle.trim()) {
        setListError('Введите название колонки.');
        return;
      }
      setListError(null);
      try {
        await createListMutation.mutateAsync(listTitle.trim());
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Не удалось создать колонку. Попробуйте ещё раз.';
        setListError(message);
        setToast({ id: Date.now(), message, type: 'error' });
      }
    },
    [createListMutation, listTitle],
  );

  const handleCancelList = useCallback(() => {
    if (!createListMutation.isPending) {
      closeListForm();
    }
  }, [closeListForm, createListMutation.isPending]);

  const handleOpenTaskDialog = useCallback((list: Board['lists'][number]) => {
    setActiveList(list);
    setTaskDialogError(null);
    setTaskDialogOpen(true);
  }, []);

  const handleTaskDialogClose = useCallback(() => {
    if (!createTaskMutation.isPending) {
      setTaskDialogOpen(false);
      setActiveList(null);
      setTaskDialogError(null);
    }
  }, [createTaskMutation.isPending]);

  const handleTaskDialogSubmit = useCallback(
    async (payload: TaskCreatePayload) => {
      if (!activeList) {
        return;
      }
      setTaskDialogError(null);
      try {
        await createTaskMutation.mutateAsync({ listId: activeList.id, payload });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Не удалось создать задачу. Попробуйте ещё раз.';
        setTaskDialogError(message);
        setToast({ id: Date.now(), message, type: 'error' });
        throw error;
      }
    },
    [activeList, createTaskMutation],
  );

  const isLoading = boardQuery.isLoading;
  const error = boardQuery.error;
  const board = boardQuery.data;

  return (
    <section className="flex flex-col gap-4">
      {toast ? (
        <div
          className={`flex items-center justify-between rounded-lg px-4 py-2 text-sm text-white shadow ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 text-xs font-semibold uppercase tracking-wide text-white/80 hover:text-white"
          >
            Закрыть
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonColumn key={index} />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <h2 className="text-lg font-semibold">Не удалось загрузить план задач.</h2>
          <p className="mt-2 text-sm">{error.message}</p>
          <button
            type="button"
            onClick={() => boardQuery.refetch()}
            className="mt-3 inline-flex items-center rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Повторить попытку
          </button>
        </div>
      ) : null}

      {!isLoading && !error && board ? (
        <>
          {board.isOwner && showInlineAddListButton && !isListFormVisible ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openListForm}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Добавить колонку
              </button>
            </div>
          ) : null}

          {board.isOwner && isListFormVisible ? (
            <form
              onSubmit={handleListSubmit}
              className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 md:flex-row md:items-end"
            >
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="new-list-title" className="text-xs font-semibold uppercase text-neutral-500">
                  Название колонки
                </label>
                <input
                  id="new-list-title"
                  type="text"
                  value={listTitle}
                  onChange={(event) => setListTitle(event.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                  placeholder="Например, «Подготовка»"
                  disabled={createListMutation.isPending}
                  autoFocus
                />
                {listError ? <p className="text-xs text-red-600 dark:text-red-400">{listError}</p> : null}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancelList}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  disabled={createListMutation.isPending}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={createListMutation.isPending}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-70"
                >
                  Создать
                </button>
              </div>
            </form>
          ) : null}

          <div className="flex gap-4 overflow-x-auto pb-2">
            {board.lists.length === 0 ? (
              <div className="flex w-full min-w-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                Добавьте первую колонку (например, «Подготовка»)
              </div>
            ) : (
              board.lists.map((taskList) => (
                <TaskListColumn
                  key={taskList.id}
                  list={taskList}
                  isOwner={board.isOwner}
                  onAddTask={handleOpenTaskDialog}
                />
              ))
            )}
          </div>
        </>
      ) : null}

      <TaskCreateDialog
        open={isTaskDialogOpen && activeList !== null}
        listTitle={activeList?.title ?? ''}
        onClose={handleTaskDialogClose}
        onSubmit={handleTaskDialogSubmit}
        loading={createTaskMutation.isPending}
        errorMessage={taskDialogError}
      />
    </section>
  );
});

TaskBoard.displayName = 'TaskBoard';

export default TaskBoard;
