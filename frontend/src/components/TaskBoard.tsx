'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  forwardRef,
  type DragEvent,
  type FormEvent,
  type JSX,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';

import {
  createList,
  createTask,
  getBoard,
  reorderTaskLists,
  reorderTasksInList,
  updateTask,
} from '@/lib/tasksApi';
import type { Board, Task, TaskList } from '@/types/task';

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

type DragMode = 'mouse' | 'keyboard';

type DragContext =
  | { type: 'list'; id: number; mode: DragMode }
  | { type: 'task'; id: number; listId: number; mode: DragMode }
  | null;

type DropTaskIndicator = { listId: number | null; index: number | null };

export const arrayMove = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  const list = [...items];
  if (fromIndex < 0 || fromIndex >= list.length) {
    return list;
  }
  const [item] = list.splice(fromIndex, 1);
  if (toIndex <= 0) {
    list.unshift(item);
  } else if (toIndex >= list.length) {
    list.push(item);
  } else {
    list.splice(toIndex, 0, item);
  }
  return list;
};

export const insertAt = <T,>(items: T[], index: number, item: T): T[] => {
  const list = [...items];
  const safeIndex = Math.max(0, Math.min(index, list.length));
  list.splice(safeIndex, 0, item);
  return list;
};

export const withoutIndex = <T,>(items: T[], index: number): T[] =>
  items.filter((_, currentIndex) => currentIndex !== index);

const reindexTasks = (tasks: Task[]): Task[] => tasks.map((task, index) => ({ ...task, order: index }));

const cloneBoard = (board: Board): Board => ({
  event: board.event,
  isOwner: board.isOwner,
  lists: board.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((task) => ({ ...task })),
  })),
});

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
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);
  const [boardState, setBoardState] = useState<Board | null>(null);
  const [dragContext, setDragContext] = useState<DragContext>(null);
  const [dropListId, setDropListId] = useState<number | null>(null);
  const [dropTaskIndicator, setDropTaskIndicator] = useState<DropTaskIndicator>({ listId: null, index: null });
  const [isSyncing, setSyncing] = useState(false);

  const boardQueryKey = useMemo(() => ['events', eventId, 'board'], [eventId]);

  const boardQuery = useQuery<Board, Error>({
    queryKey: boardQueryKey,
    queryFn: () => getBoard(eventId),
  });

  useEffect(() => {
    const data = boardQuery.data;
    if (data) {
      setBoardState(cloneBoard(data));
    }
  }, [boardQuery.data]);

  const board = boardState ?? boardQuery.data ?? null;
  const isOwner = board?.isOwner ?? false;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (dragContext) {
      document.body.classList.add('dragging');
      return () => document.body.classList.remove('dragging');
    }
    document.body.classList.remove('dragging');
    return undefined;
  }, [dragContext]);

  const activeList = useMemo(() => {
    if (!board || activeListId === null) {
      return null;
    }
    return board.lists.find((list) => list.id === activeListId) ?? null;
  }, [board, activeListId]);

  const clearDropIndicators = useCallback(() => {
    setDropListId(null);
    setDropTaskIndicator({ listId: null, index: null });
  }, []);

  const cancelDrag = useCallback(() => {
    setDragContext(null);
    clearDropIndicators();
  }, [clearDropIndicators]);

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
      setToast({ id: Date.now(), message: 'Колонка создана.', type: 'success' });
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
      setActiveListId(null);
      setTaskDialogError(null);
    },
  });

  const handleListSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = listTitle.trim();
      if (!trimmed) {
        setListError('Введите название колонки.');
        return;
      }
      try {
        await createListMutation.mutateAsync(trimmed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать колонку.';
        setListError(message);
      }
    },
    [createListMutation, listTitle],
  );

  const handleCancelList = useCallback(() => {
    closeListForm();
  }, [closeListForm]);

  const handleOpenTaskDialog = useCallback((list: TaskList & { tasks: Task[] }) => {
    setActiveListId(list.id);
    setTaskDialogError(null);
    setTaskDialogOpen(true);
  }, []);

  const handleTaskDialogClose = useCallback(() => {
    setTaskDialogOpen(false);
    setActiveListId(null);
    setTaskDialogError(null);
  }, []);

  const handleTaskDialogSubmit = useCallback(
    async (payload: TaskCreatePayload) => {
      if (activeListId === null) {
        return;
      }
      try {
        await createTaskMutation.mutateAsync({ listId: activeListId, payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось создать задачу.';
        setTaskDialogError(message);
      }
    },
    [activeListId, createTaskMutation],
  );

  const handleListDragStart = useCallback(
    (listId: number, mode: DragMode) => {
      if (!isOwner || isSyncing) {
        return;
      }
      setDragContext({ type: 'list', id: listId, mode });
    },
    [isOwner, isSyncing],
  );

  const handleTaskDragStart = useCallback(
    (listId: number, taskId: number, mode: DragMode) => {
      if (!isOwner || isSyncing) {
        return;
      }
      setDragContext({ type: 'task', id: taskId, listId, mode });
    },
    [isOwner, isSyncing],
  );

  const handleListDragOver = useCallback(
    (listId: number) => {
      if (dragContext?.type !== 'list') {
        return;
      }
      setDropListId(listId);
    },
    [dragContext],
  );

  const handleTaskDragOver = useCallback(
    (listId: number, index: number) => {
      if (dragContext?.type !== 'task') {
        return;
      }
      setDropTaskIndicator({ listId, index });
    },
    [dragContext],
  );

  const commitListReorder = useCallback(
    async (targetIndex: number) => {
      const context = dragContext;
      if (!boardState || !context || context.type !== 'list' || isSyncing) {
        clearDropIndicators();
        return;
      }

      const sourceIndex = boardState.lists.findIndex((list) => list.id === context.id);
      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        clearDropIndicators();
        if (context.mode !== 'keyboard') {
          setDragContext(null);
        }
        return;
      }

      const previous = cloneBoard(boardState);
      setSyncing(true);

      const movedLists = arrayMove(boardState.lists, sourceIndex, targetIndex).map((list, index) => ({
        ...list,
        order: index,
      }));
      setBoardState({ ...boardState, lists: movedLists });
      clearDropIndicators();

      const maintainContext = context.mode === 'keyboard';
      if (!maintainContext) {
        setDragContext(null);
      }

      try {
        await reorderTaskLists(eventId, movedLists.map((list) => list.id));
        await queryClient.invalidateQueries({ queryKey: boardQueryKey });
        if (maintainContext) {
          setDragContext({ ...context });
        }
      } catch (error) {
        setBoardState(previous);
        setDragContext(null);
        setToast({
          id: Date.now(),
          message: 'Не удалось сохранить порядок колонок.',
          type: 'error',
        });
        console.error('Failed to reorder task lists', error);
      } finally {
        setSyncing(false);
      }
    },
    [boardState, dragContext, isSyncing, clearDropIndicators, eventId, queryClient, boardQueryKey],
  );

  const commitTaskReorder = useCallback(
    async (targetListId: number, targetIndex: number) => {
      const context = dragContext;
      if (!boardState || !context || context.type !== 'task' || isSyncing) {
        clearDropIndicators();
        return;
      }

      const sourceListIndex = boardState.lists.findIndex((list) => list.id === context.listId);
      const targetListIndex = boardState.lists.findIndex((list) => list.id === targetListId);
      if (sourceListIndex === -1 || targetListIndex === -1) {
        clearDropIndicators();
        return;
      }

      const sourceList = boardState.lists[sourceListIndex];
      const targetList = boardState.lists[targetListIndex];
      const sourceTaskIndex = sourceList.tasks.findIndex((task) => task.id === context.id);
      if (sourceTaskIndex === -1) {
        clearDropIndicators();
        return;
      }

      const previous = cloneBoard(boardState);
      const maintainContext = context.mode === 'keyboard';

      if (sourceList.id === targetList.id) {
        let destinationIndex = targetIndex;
        if (destinationIndex > sourceList.tasks.length) {
          destinationIndex = sourceList.tasks.length;
        }
        if (destinationIndex > sourceTaskIndex) {
          destinationIndex -= 1;
        }
        if (destinationIndex < 0) {
          destinationIndex = 0;
        }
        if (destinationIndex === sourceTaskIndex) {
          clearDropIndicators();
          if (!maintainContext) {
            setDragContext(null);
          }
          return;
        }

        setSyncing(true);
        const reorderedTasks = reindexTasks(arrayMove(sourceList.tasks, sourceTaskIndex, destinationIndex));
        const updatedLists = boardState.lists.map((list, index) =>
          index === sourceListIndex ? { ...list, tasks: reorderedTasks } : list,
        );
        setBoardState({ ...boardState, lists: updatedLists });
        clearDropIndicators();
        if (!maintainContext) {
          setDragContext(null);
        }

        try {
          await reorderTasksInList(sourceList.id, reorderedTasks.map((task) => task.id));
          await queryClient.invalidateQueries({ queryKey: boardQueryKey });
          if (maintainContext) {
            setDragContext({ ...context });
          }
        } catch (error) {
          setBoardState(previous);
          setDragContext(null);
          setToast({
            id: Date.now(),
            message: 'Не удалось сохранить порядок задач.',
            type: 'error',
          });
          console.error('Failed to reorder tasks', error);
        } finally {
          setSyncing(false);
        }
        return;
      }

      setSyncing(true);
      const destinationIndex = Math.max(0, Math.min(targetIndex, targetList.tasks.length));
      const remainingTasks = reindexTasks(withoutIndex(sourceList.tasks, sourceTaskIndex));
      const movedTask: Task = { ...sourceList.tasks[sourceTaskIndex], list: targetList.id };
      const insertedTasks = reindexTasks(insertAt(targetList.tasks, destinationIndex, movedTask));
      const updatedLists = boardState.lists.map((list, index) => {
        if (index === sourceListIndex) {
          return { ...list, tasks: remainingTasks };
        }
        if (index === targetListIndex) {
          return { ...list, tasks: insertedTasks };
        }
        return list;
      });
      setBoardState({ ...boardState, lists: updatedLists });
      clearDropIndicators();
      setDragContext(maintainContext ? { ...context, listId: targetList.id } : null);

      const previousSourceOrder =
        previous.lists.find((list) => list.id === sourceList.id)?.tasks.map((task) => task.id) ?? [];
      const previousTargetOrder =
        previous.lists.find((list) => list.id === targetList.id)?.tasks.map((task) => task.id) ?? [];
      const remainingTaskIds = remainingTasks.map((task) => task.id);
      const insertedTaskIds = insertedTasks.map((task) => task.id);
      const movedTaskId = movedTask.id;

      let listUpdated = false;
      let sourcePersisted = false;
      let targetPersisted = false;

      try {
        if (context.listId !== targetList.id) {
          await updateTask(movedTaskId, { list: targetList.id });
          listUpdated = true;
        }

        if (remainingTasks.length > 0) {
          await reorderTasksInList(sourceList.id, remainingTaskIds);
          sourcePersisted = true;
        }

        await reorderTasksInList(targetList.id, insertedTaskIds);
        targetPersisted = true;
        await queryClient.invalidateQueries({ queryKey: boardQueryKey });
        if (maintainContext) {
          setDragContext({ ...context, listId: targetList.id });
        }
      } catch (error) {
        setBoardState(previous);
        setDragContext(null);
        setToast({
          id: Date.now(),
          message: 'Failed to sync tasks order.',
          type: 'error',
        });
        console.error('Failed to reorder tasks', error);

        if (targetPersisted && previousTargetOrder.length > 0) {
          try {
            await reorderTasksInList(targetList.id, previousTargetOrder);
          } catch (rollbackError) {
            console.warn('Failed to rollback target list reorder', rollbackError);
          }
        }

        if (sourcePersisted && previousSourceOrder.length > 0) {
          try {
            await reorderTasksInList(sourceList.id, previousSourceOrder);
          } catch (rollbackError) {
            console.warn('Failed to rollback source list reorder', rollbackError);
          }
        }

        if (listUpdated) {
          try {
            await updateTask(movedTaskId, { list: sourceList.id });
          } catch (rollbackError) {
            console.warn('Failed to rollback task list update', rollbackError);
          }
        }
      } finally {
        setSyncing(false);
      }
    },
    [boardState, dragContext, isSyncing, clearDropIndicators, queryClient, boardQueryKey],
  );

  const handleListDrop = useCallback(
    (listId: number) => {
      const lists = boardState?.lists ?? [];
      const targetIndex = lists.findIndex((list) => list.id === listId);
      if (targetIndex === -1) {
        cancelDrag();
        return;
      }
      void commitListReorder(targetIndex);
    },
    [boardState, commitListReorder, cancelDrag],
  );

  const handleListDropToEnd = useCallback(() => {
    if (!boardState) {
      cancelDrag();
      return;
    }
    void commitListReorder(boardState.lists.length - 1);
  }, [boardState, commitListReorder, cancelDrag]);

  const handleTaskDrop = useCallback(
    (listId: number, index: number) => {
      void commitTaskReorder(listId, index);
    },
    [commitTaskReorder],
  );

  const handleListKeyboardMove = useCallback(
    (listId: number, direction: 'left' | 'right') => {
      if (!boardState || dragContext?.type !== 'list') {
        return;
      }
      const currentIndex = boardState.lists.findIndex((list) => list.id === listId);
      if (currentIndex === -1) {
        return;
      }
      const offset = direction === 'left' ? -1 : 1;
      const targetIndex = Math.max(0, Math.min(boardState.lists.length - 1, currentIndex + offset));
      if (targetIndex === currentIndex) {
        return;
      }
      void commitListReorder(targetIndex);
    },
    [boardState, dragContext, commitListReorder],
  );

  const handleTaskKeyboardMove = useCallback(
    (listId: number, taskId: number, direction: 'up' | 'down' | 'left' | 'right') => {
      if (!boardState || dragContext?.type !== 'task' || dragContext.id !== taskId) {
        return;
      }
      const listIndex = boardState.lists.findIndex((list) => list.id === listId);
      if (listIndex === -1) {
        return;
      }
      const list = boardState.lists[listIndex];
      const taskIndex = list.tasks.findIndex((task) => task.id === taskId);
      if (taskIndex === -1) {
        return;
      }
      if (direction === 'up' || direction === 'down') {
        const offset = direction === 'up' ? -1 : 1;
        const targetIndex = Math.max(0, Math.min(list.tasks.length, taskIndex + offset));
        void commitTaskReorder(list.id, targetIndex);
        return;
      }
      const listOffset = direction === 'left' ? -1 : 1;
      const neighbourIndex = listIndex + listOffset;
      if (neighbourIndex < 0 || neighbourIndex >= boardState.lists.length) {
        return;
      }
      const neighbourList = boardState.lists[neighbourIndex];
      void commitTaskReorder(neighbourList.id, neighbourList.tasks.length);
    },
    [boardState, dragContext, commitTaskReorder],
  );

  const handleBoardDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (dragContext?.type === 'list') {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropListId(null);
      }
    },
    [dragContext],
  );

  const handleBoardDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (dragContext?.type !== 'list') {
        return;
      }
      event.preventDefault();
      handleListDropToEnd();
    },
    [dragContext, handleListDropToEnd],
  );

  const handleTaskDragEnd = useCallback(() => {
    cancelDrag();
  }, [cancelDrag]);

  const handleListDragEnd = useCallback(() => {
    cancelDrag();
  }, [cancelDrag]);

  const isLoading = boardQuery.isLoading;
  const error = boardQuery.error;

  return (
    <section className="flex flex-col gap-6">
      {toast ? (
        <div
          role="status"
          className={`fixed right-8 top-8 z-40 flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg transition ${
            toast.type === 'success'
              ? 'bg-emerald-500 text-white'
              : 'bg-red-600 text-white'
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
          <h2 className="text-lg font-semibold">Не удалось загрузить доску.</h2>
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
                  placeholder="Например, «В работе»"
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

          <div
            className="flex gap-4 overflow-x-auto pb-2"
            onDragOver={handleBoardDragOver}
            onDrop={handleBoardDrop}
            aria-dropeffect={dragContext?.type === 'list' ? 'move' : undefined}
          >
            {board.lists.length === 0 ? (
              <div className="flex w-full min-w-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                Добавьте первую колонку, чтобы начать планирование.
              </div>
            ) : (
              board.lists.map((taskList) => (
                <TaskListColumn
                  key={taskList.id}
                  list={taskList}
                  isOwner={board.isOwner}
                  isSyncing={isSyncing}
                  dragContext={dragContext}
                  dropListId={dropListId}
                  dropTaskIndicator={dropTaskIndicator}
                  onAddTask={handleOpenTaskDialog}
                  onListDragStart={handleListDragStart}
                  onListDragOver={handleListDragOver}
                  onListDrop={handleListDrop}
                  onListDragEnd={handleListDragEnd}
                  onListKeyboardMove={handleListKeyboardMove}
                  onTaskDragStart={handleTaskDragStart}
                  onTaskDragOver={handleTaskDragOver}
                  onTaskDrop={handleTaskDrop}
                  onTaskDragEnd={handleTaskDragEnd}
                  onTaskKeyboardMove={handleTaskKeyboardMove}
                  onCancelDrag={cancelDrag}
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
