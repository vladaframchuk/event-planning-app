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
  useRef,
  useState,
} from 'react';

import { useRealtimeStatusSetter } from '@/context/realtimeStatus';
import { useEventChannel, type EventChannelMessage } from '@/hooks/useEventChannel';
import { useInvalidateEventProgress } from '@/hooks/useInvalidateEventProgress';
import type { EventProgress } from '@/lib/eventsApi';
import { getMe, type Profile } from '@/lib/profileApi';
import {
  createList,
  createTask,
  getBoard,
  deleteTask,
  deleteTaskList,
  reorderTaskLists,
  reorderTasksInList,
  takeTask,
  updateTask,
  updateTaskStatus,
} from '@/lib/tasksApi';
import type { Board, BoardParticipant, Task, TaskList, TaskStatus } from '@/types/task';

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

const reindexTaskLists = (lists: Array<TaskList & { tasks: Task[] }>): Array<TaskList & { tasks: Task[] }> =>
  lists.map((taskList, index) => ({
    ...taskList,
    order: index,
  }));

const cloneBoard = (board: Board): Board => ({
  event: board.event,
  isOwner: board.isOwner,
  participants: board.participants.map((participant) => ({
    ...participant,
    user: { ...participant.user },
  })),
  lists: board.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((task) => ({ ...task })),
  })),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNumberArray = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const result: number[] = [];
  for (const item of value) {
    const parsed = toNumber(item);
    if (parsed !== null) {
      result.push(parsed);
    }
  }
  return result;
};

const mapRealtimeTaskPayload = (payload: unknown): Task | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const id = toNumber(payload.id);
  const listId = toNumber(payload.list);
  const title = typeof payload.title === 'string' ? payload.title : null;
  const status = typeof payload.status === 'string' ? (payload.status as TaskStatus) : null;
  const order = toNumber(payload.order);
  const createdAt = typeof payload.created_at === 'string' ? payload.created_at : null;
  const updatedAt = typeof payload.updated_at === 'string' ? payload.updated_at : null;
  if (id === null || listId === null || !title || !status || order === null || !createdAt || !updatedAt) {
    return null;
  }
  const description = typeof payload.description === 'string' ? payload.description : undefined;
  const assigneeValue = payload.assignee;
  const assignee =
    assigneeValue === null || assigneeValue === undefined ? null : toNumber(assigneeValue);
  const startAt =
    typeof payload.start_at === 'string' || payload.start_at === null ? (payload.start_at as string | null) : null;
  const dueAt =
    typeof payload.due_at === 'string' || payload.due_at === null ? (payload.due_at as string | null) : null;
  const dependsOn = toNumberArray(payload.depends_on) ?? [];

  return {
    id,
    list: listId,
    title,
    description,
    status,
    assignee: assignee ?? null,
    startAt: startAt ?? null,
    dueAt: dueAt ?? null,
    order,
    dependsOn,
    createdAt,
    updatedAt,
  };
};

const mapRealtimeTaskListPayload = (payload: unknown): TaskList | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const id = toNumber(payload.id);
  const eventId = toNumber(payload.event);
  const title = typeof payload.title === 'string' ? payload.title : null;
  const order = toNumber(payload.order);
  const createdAt = typeof payload.created_at === 'string' ? payload.created_at : null;
  const updatedAt = typeof payload.updated_at === 'string' ? payload.updated_at : null;
  if (id === null || eventId === null || !title || order === null || !createdAt || !updatedAt) {
    return null;
  }
  return {
    id,
    event: eventId,
    title,
    order,
    createdAt,
    updatedAt,
  };
};

const mapTaskDeletePayload = (payload: unknown): number | null => {
  if (!isRecord(payload)) {
    return null;
  }
  return toNumber(payload.id);
};

const mapTaskReorderPayload = (
  payload: unknown,
): { listId: number; orderedIds: number[] } | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const listId = toNumber(payload.list);
  if (listId === null) {
    return null;
  }
  const orderedIds = toNumberArray(payload.ordered_ids);
  return { listId, orderedIds: orderedIds ?? [] };
};

const mapTaskListReorderPayload = (payload: unknown): number[] | null => {
  if (!isRecord(payload)) {
    return null;
  }
  return toNumberArray(payload.ordered_ids) ?? [];
};

const upsertTaskInBoard = (board: Board, task: Task): boolean | null => {
  let targetList: (TaskList & { tasks: Task[] }) | undefined;
  for (const list of board.lists) {
    if (list.id === task.list) {
      targetList = list;
    } else {
      const filtered = list.tasks.filter((item) => item.id !== task.id);
      if (filtered.length !== list.tasks.length) {
        list.tasks = reindexTasks(filtered);
      }
    }
  }
  if (!targetList) {
    return null;
  }
  const tasksWithoutCurrent = targetList.tasks.filter((item) => item.id !== task.id);
  const insertIndex = Math.max(0, Math.min(task.order, tasksWithoutCurrent.length));
  tasksWithoutCurrent.splice(insertIndex, 0, task);
  targetList.tasks = reindexTasks(tasksWithoutCurrent);
  return true;
};

const removeTaskFromBoard = (board: Board, taskId: number): boolean => {
  let changed = false;
  for (const list of board.lists) {
    const filtered = list.tasks.filter((task) => task.id !== taskId);
    if (filtered.length !== list.tasks.length) {
      list.tasks = reindexTasks(filtered);
      changed = true;
    }
  }
  return changed;
};

const reorderTasksInBoard = (
  board: Board,
  listId: number,
  orderedIds: number[],
): boolean | null => {
  const list = board.lists.find((item) => item.id === listId);
  if (!list) {
    return null;
  }
  if (orderedIds.length === 0) {
    list.tasks = reindexTasks(list.tasks);
    return true;
  }
  const byId = new Map(list.tasks.map((task) => [task.id, task]));
  const ordered: Task[] = [];
  for (const id of orderedIds) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      byId.delete(id);
    }
  }
  if (ordered.length === 0 && orderedIds.length > 0) {
    return null;
  }
  for (const task of list.tasks) {
    if (byId.has(task.id)) {
      ordered.push(task);
    }
  }
  list.tasks = reindexTasks(ordered);
  return true;
};

const upsertTaskListInBoard = (board: Board, list: TaskList): boolean => {
  const lists = board.lists.slice();
  const existingIndex = lists.findIndex((item) => item.id === list.id);
  const preservedTasks = existingIndex !== -1 ? lists[existingIndex].tasks : [];
  if (existingIndex !== -1) {
    lists.splice(existingIndex, 1);
  }
  const insertIndex = Math.max(0, Math.min(list.order, lists.length));
  lists.splice(insertIndex, 0, { ...list, tasks: preservedTasks });
  board.lists = reindexTaskLists(lists);
  return true;
};

const removeTaskListFromBoard = (board: Board, listId: number): boolean => {
  const lists = board.lists.filter((item) => item.id !== listId);
  if (lists.length === board.lists.length) {
    return false;
  }
  board.lists = reindexTaskLists(lists);
  return true;
};

const reorderTaskListsInBoard = (board: Board, orderedIds: number[]): boolean | null => {
  if (orderedIds.length === 0) {
    board.lists = reindexTaskLists(board.lists);
    return true;
  }
  const byId = new Map(board.lists.map((list) => [list.id, list]));
  const ordered: Array<TaskList & { tasks: Task[] }> = [];
  for (const id of orderedIds) {
    const list = byId.get(id);
    if (list) {
      ordered.push(list);
      byId.delete(id);
    }
  }
  if (ordered.length === 0 && orderedIds.length > 0) {
    return null;
  }
  for (const list of board.lists) {
    if (byId.has(list.id)) {
      ordered.push(list);
    }
  }
  board.lists = reindexTaskLists(ordered);
  return true;
};

const applyRealtimeBoardUpdate = (board: Board, message: EventChannelMessage): Board | null => {
  const working = cloneBoard(board);
  switch (message.type) {
    case 'task.created':
    case 'task.updated': {
      const task = mapRealtimeTaskPayload(message.payload);
      if (!task) {
        return null;
      }
      const result = upsertTaskInBoard(working, task);
      if (result === null) {
        return null;
      }
      return working;
    }
    case 'task.deleted': {
      const taskId = mapTaskDeletePayload(message.payload);
      if (taskId === null) {
        return null;
      }
      const changed = removeTaskFromBoard(working, taskId);
      return changed ? working : board;
    }
    case 'task.reordered': {
      const payload = mapTaskReorderPayload(message.payload);
      if (!payload) {
        return null;
      }
      const changed = reorderTasksInBoard(working, payload.listId, payload.orderedIds);
      if (changed === null) {
        return null;
      }
      return changed ? working : board;
    }
    case 'tasklist.created':
    case 'tasklist.updated': {
      const list = mapRealtimeTaskListPayload(message.payload);
      if (!list) {
        return null;
      }
      upsertTaskListInBoard(working, list);
      return working;
    }
    case 'tasklist.deleted': {
      const listId = mapTaskDeletePayload(message.payload);
      if (listId === null) {
        return null;
      }
      const changed = removeTaskListFromBoard(working, listId);
      return changed ? working : board;
    }
    case 'tasklist.reordered': {
      const orderedIds = mapTaskListReorderPayload(message.payload);
      if (!orderedIds) {
        return null;
      }
      const changed = reorderTaskListsInBoard(working, orderedIds);
      if (changed === null) {
        return null;
      }
      return changed ? working : board;
    }
    default:
      return board;
  }
};

const clampProgressPercentage = (done: number, total: number): number =>
  total <= 0 ? 0 : (done / total) * 100;

const applyStatusTransitionToProgress = (
  progress: EventProgress,
  listId: number,
  from: TaskStatus,
  to: TaskStatus,
): EventProgress => {
  if (from === to) {
    return progress;
  }
  const nextCounts: EventProgress['counts'] = { ...progress.counts };
  nextCounts[from] = Math.max(0, nextCounts[from] - 1);
  nextCounts[to] = nextCounts[to] + 1;

  const nextByList = progress.by_list.map((item) => {
    if (item.list_id !== listId) {
      return item;
    }
    const nextItem = { ...item };
    nextItem[from] = Math.max(0, nextItem[from] - 1);
    nextItem[to] = nextItem[to] + 1;
    return nextItem;
  });

  return {
    ...progress,
    counts: nextCounts,
    by_list: nextByList,
    percent_done: clampProgressPercentage(nextCounts.done, progress.total_tasks),
  };
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
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [taskDialogError, setTaskDialogError] = useState<string | null>(null);
  const [boardState, setBoardState] = useState<Board | null>(null);
  const [dragContext, setDragContext] = useState<DragContext>(null);
  const [dropListId, setDropListId] = useState<number | null>(null);
  const [dropTaskIndicator, setDropTaskIndicator] = useState<DropTaskIndicator>({ listId: null, index: null });
  const [isSyncing, setSyncing] = useState(false);
  const [showMyTasksOnly, setShowMyTasksOnly] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<number>>(new Set());

  const boardQueryKey = useMemo(() => ['events', eventId, 'board'], [eventId]);
  const progressQueryKey = useMemo(() => ['event-progress', eventId] as const, [eventId]);
  const invalidateProgress = useInvalidateEventProgress(eventId);
  const { status: realtimeStatus, subscribe: subscribeToEventChannel } = useEventChannel(eventId);
  const setRealtimeStatus = useRealtimeStatusSetter();
  const progressInvalidateTimeoutRef = useRef<number | null>(null);
  const boardSnapshotRef = useRef<Board | null>(null);

  const invalidateBoard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: boardQueryKey, exact: false }),
    [queryClient, boardQueryKey],
  );

  const invalidateBoardAndProgress = useCallback(async () => {
    await Promise.all([invalidateBoard(), invalidateProgress()]);
  }, [invalidateBoard, invalidateProgress]);

  const updateProgressCache = useCallback(
    (updater: (current: EventProgress) => EventProgress) => {
      const previous = queryClient.getQueryData<EventProgress>(progressQueryKey);
      if (!previous) {
        return undefined;
      }
      const next = updater(previous);
      queryClient.setQueryData(progressQueryKey, next);
      return previous;
    },
    [queryClient, progressQueryKey],
  );

  const restoreProgressCache = useCallback(
    (snapshot?: EventProgress) => {
      if (snapshot) {
        queryClient.setQueryData(progressQueryKey, snapshot);
      }
    },
    [queryClient, progressQueryKey],
  );

  const scheduleProgressInvalidate = useCallback(() => {
    void invalidateProgress();
    if (typeof window === 'undefined') {
      return;
    }
    if (progressInvalidateTimeoutRef.current !== null) {
      window.clearTimeout(progressInvalidateTimeoutRef.current);
    }
    const progress = queryClient.getQueryData<EventProgress>(progressQueryKey);
    const delay =
      progress && Number.isFinite(progress.ttl_seconds)
        ? Math.max(800, Math.min(progress.ttl_seconds * 1000, 10_000))
        : 1200;
    progressInvalidateTimeoutRef.current = window.setTimeout(() => {
      progressInvalidateTimeoutRef.current = null;
      void invalidateProgress();
    }, delay);
  }, [invalidateProgress, progressQueryKey, queryClient]);

  const handleTaskChanged = useCallback(() => {
    scheduleProgressInvalidate();
  }, [scheduleProgressInvalidate]);

  const handleRealtimeMessage = useCallback(
    (message: EventChannelMessage) => {
      if (!message?.type) {
        return;
      }
      if (message.type === 'progress.invalidate') {
        void invalidateProgress();
        return;
      }
      let shouldRefetch = false;
      setBoardState((current) => {
        const base = current ?? boardSnapshotRef.current;
        if (!base) {
          shouldRefetch = true;
          return current;
        }
        const next = applyRealtimeBoardUpdate(base, message);
        if (next === null) {
          shouldRefetch = true;
          return current;
        }
        boardSnapshotRef.current = next;
        return next;
      });
      if (shouldRefetch) {
        void invalidateBoard();
      }
    },
    [invalidateBoard, invalidateProgress],
  );

  const boardQuery = useQuery<Board, Error>({
    queryKey: boardQueryKey,
    queryFn: () => getBoard(eventId),
  });

  const profileQuery = useQuery<Profile, Error>({
    queryKey: ['profile', 'me'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const data = boardQuery.data;
    if (data) {
      setBoardState(cloneBoard(data));
    }
  }, [boardQuery.data]);

  useEffect(() => {
    boardSnapshotRef.current = boardState ?? boardQuery.data ?? null;
  }, [boardState, boardQuery.data]);

  useEffect(() => subscribeToEventChannel(handleRealtimeMessage), [subscribeToEventChannel, handleRealtimeMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    return () => {
      if (progressInvalidateTimeoutRef.current !== null) {
        window.clearTimeout(progressInvalidateTimeoutRef.current);
        progressInvalidateTimeoutRef.current = null;
      }
    };
  }, []);

  const board = boardState ?? boardQuery.data ?? null;
  const me = profileQuery.data ?? null;

  const participantsById = useMemo(() => {
    if (!board) {
      return new Map<number, BoardParticipant>();
    }
    return new Map(board.participants.map((participant) => [participant.id, participant]));
  }, [board]);

  const myParticipantId = useMemo(() => {
    if (!board || !me) {
      return null;
    }
    const participant = board.participants.find((item) => item.user.id === me.id);
    return participant ? participant.id : null;
  }, [board, me]);

  const isParticipant = myParticipantId !== null;

  useEffect(() => {
    if (!isParticipant && showMyTasksOnly) {
      setShowMyTasksOnly(false);
    }
  }, [isParticipant, showMyTasksOnly]);

  const taskPermissions = useMemo(() => {
    const permissions = new Map<number, { canTake: boolean; canChangeStatus: boolean }>();
    if (!board) {
      return permissions;
    }
    for (const list of board.lists) {
      for (const task of list.tasks) {
        const canTake = myParticipantId !== null && task.assignee === null;
        const canChangeStatus = board.isOwner || (myParticipantId !== null && task.assignee === myParticipantId);
        permissions.set(task.id, { canTake, canChangeStatus });
      }
    }
    return permissions;
  }, [board, myParticipantId]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    if (dragContext) {
      document.body.classList.add('dragging');
      return () => {
        document.body.classList.remove('dragging');
      };
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

  const showToast = useCallback((message: string, type: ToastState['type']) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const updatePendingTask = useCallback((taskId: number, pending: boolean) => {
    setPendingTaskIds((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const isTaskPending = useCallback((taskId: number) => pendingTaskIds.has(taskId), [pendingTaskIds]);

  const toggleMyTasksOnly = useCallback(() => {
    if (!isParticipant) {
      return;
    }
    setShowMyTasksOnly((current) => !current);
  }, [isParticipant]);

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
      await invalidateBoard();
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
      await invalidateBoardAndProgress();
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
        setListError('Название колонки не может быть пустым.');
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

  const handleStatusChangeDeniedMessage = useCallback(() => {
    showToast('Недостаточно прав.', 'error');
  }, [showToast]);

  const handleTakeTask = useCallback(
    async (taskId: number): Promise<boolean> => {
      if (myParticipantId === null) {
        showToast('Недостаточно прав.', 'error');
        return false;
      }
      const source = boardState ?? board;
      if (!source) {
        return false;
      }
      const optimistic = cloneBoard(source);
      let updated = false;
      for (const list of optimistic.lists) {
        const task = list.tasks.find((item) => item.id === taskId);
        if (task) {
          task.assignee = myParticipantId;
          updated = true;
          break;
        }
      }
      if (!updated) {
        return false;
      }
      setBoardState(optimistic);
      updatePendingTask(taskId, true);
      let succeeded = false;
      try {
        await takeTask(taskId);
        showToast('Задача назначена на вас.', 'success');
        await invalidateBoard();
        succeeded = true;
      } catch (error) {
        setBoardState(cloneBoard(source));
        const message = error instanceof Error ? error.message : 'Не удалось назначить задачу.';
        if (message.toLowerCase().includes('already_assigned')) {
          showToast('Задача уже назначена.', 'error');
        } else {
          showToast(message, 'error');
        }
      } finally {
        updatePendingTask(taskId, false);
      }
      return succeeded;
    },
    [board, boardState, myParticipantId, showToast, updatePendingTask, invalidateBoard],
  );


  const handleStatusChange = useCallback(
    async (taskId: number, nextStatus: TaskStatus): Promise<boolean> => {
      const permission = taskPermissions.get(taskId);
      if (!permission || !permission.canChangeStatus) {
        showToast('Недостаточно прав.', 'error');
        return false;
      }
      const source = boardState ?? board;
      if (!source) {
        return false;
      }
      const optimistic = cloneBoard(source);
      let updated = false;
      let previousStatus: TaskStatus | null = null;
      let targetListId: number | null = null;
      for (const list of optimistic.lists) {
        const task = list.tasks.find((item) => item.id === taskId);
        if (task) {
          previousStatus = task.status;
          if (previousStatus === nextStatus) {
            return true;
          }
          targetListId = list.id;
          task.status = nextStatus;
          updated = true;
          break;
        }
      }
      if (!updated || previousStatus === null || targetListId === null) {
        return false;
      }
      setBoardState(optimistic);
      updatePendingTask(taskId, true);
      const progressSnapshot = updateProgressCache((current) =>
        applyStatusTransitionToProgress(current, targetListId, previousStatus as TaskStatus, nextStatus),
      );
      let succeeded = false;
      try {
        await updateTaskStatus(taskId, nextStatus);
        await invalidateBoard();
        scheduleProgressInvalidate();
        succeeded = true;
      } catch (error) {
        setBoardState(cloneBoard(source));
        restoreProgressCache(progressSnapshot);
        const message = error instanceof Error ? error.message : 'Не удалось обновить статус задачи.';
        if (message.toLowerCase().includes('depend')) {
          showToast('Сначала завершите зависимости.', 'error');
        } else {
          showToast(message, 'error');
        }
      } finally {
        updatePendingTask(taskId, false);
      }
      return succeeded;
    },
    [
      board,
      boardState,
      taskPermissions,
      showToast,
      updatePendingTask,
      updateProgressCache,
      restoreProgressCache,
      invalidateBoard,
      scheduleProgressInvalidate,
    ],
  );

  const handleDeleteTask = useCallback(
    async (listId: number, taskId: number): Promise<boolean> => {
      const source = boardState ?? board;
      if (!source) {
        return false;
      }
      const snapshot = cloneBoard(source);
      const optimistic = cloneBoard(source);
      const targetList = optimistic.lists.find((item) => item.id === listId);
      if (!targetList) {
        return false;
      }
      const taskIndex = targetList.tasks.findIndex((item) => item.id === taskId);
      if (taskIndex === -1) {
        return false;
      }
      targetList.tasks.splice(taskIndex, 1);
      targetList.tasks = reindexTasks(targetList.tasks);
      setBoardState(optimistic);
      updatePendingTask(taskId, true);
      try {
        await deleteTask(taskId);
        showToast('Задача удалена', 'success');
        await invalidateBoard();
        return true;
      } catch (error) {
        setBoardState(snapshot);
        const message = error instanceof Error ? error.message : 'Не удалось удалить задачу.';
        showToast(`Не удалось удалить задачу: ${message}`, 'error');
        return false;
      } finally {
        updatePendingTask(taskId, false);
      }
    },
    [board, boardState, updatePendingTask, showToast, invalidateBoard],
  );

  const handleDeleteTaskList = useCallback(
    async (listId: number): Promise<boolean> => {
      const source = boardState ?? board;
      if (!source) {
        return false;
      }
      const snapshot = cloneBoard(source);
      const optimistic = cloneBoard(source);
      const listIndex = optimistic.lists.findIndex((item) => item.id === listId);
      if (listIndex === -1) {
        return false;
      }
      optimistic.lists.splice(listIndex, 1);
      optimistic.lists = reindexTaskLists(optimistic.lists);
      setBoardState(optimistic);
      try {
        await deleteTaskList(listId);
        showToast('Категория удалена', 'success');
        if (activeListId === listId) {
          setTaskDialogOpen(false);
          setActiveListId(null);
          setTaskDialogError(null);
        }
        await invalidateBoard();
        return true;
      } catch (error) {
        setBoardState(snapshot);
        const message = error instanceof Error ? error.message : 'Не удалось удалить категорию.';
        showToast(`Не удалось удалить категорию: ${message}`, 'error');
        return false;
      }
    },
    [board, boardState, activeListId, showToast, invalidateBoard, setTaskDialogOpen, setActiveListId, setTaskDialogError],
  );

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
      if (!board?.isOwner || isSyncing) {
        return;
      }
      setDragContext({ type: 'list', id: listId, mode });
    },
    [board?.isOwner, isSyncing],
  );

  const handleTaskDragStart = useCallback(
    (listId: number, taskId: number, mode: DragMode) => {
      if (!board?.isOwner || isSyncing) {
        return;
      }
      setDragContext({ type: 'task', id: taskId, listId, mode });
    },
    [board?.isOwner, isSyncing],
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
        await invalidateBoard();
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
    [boardState, dragContext, isSyncing, clearDropIndicators, eventId, invalidateBoard],
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
          await invalidateBoard();
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
        if (remainingTaskIds.join(',') !== previousSourceOrder.join(',')) {
          await reorderTasksInList(sourceList.id, remainingTaskIds);
          sourcePersisted = true;
        }
        if (insertedTaskIds.join(',') !== previousTargetOrder.join(',')) {
          await reorderTasksInList(targetList.id, insertedTaskIds);
          targetPersisted = true;
        }
        await invalidateBoard();
        if (maintainContext) {
          setDragContext({ ...context, listId: targetList.id });
        }
      } catch (error) {
        console.error('Failed to persist task reorder', {
          error,
          listUpdated,
          sourcePersisted,
          targetPersisted,
        });
        setBoardState(previous);
        setDragContext(null);
        setToast({
          id: Date.now(),
          message: 'Не удалось сохранить порядок задач.',
          type: 'error',
        });
      } finally {
        setSyncing(false);
      }
    },
    [boardState, dragContext, isSyncing, clearDropIndicators, invalidateBoard],
  );

  const handleBoardDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!board?.isOwner || dragContext?.type !== 'list') {
        return;
      }
      event.preventDefault();
    },
    [board?.isOwner, dragContext],
  );

  const handleBoardDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!board?.isOwner || dragContext?.type !== 'list') {
        return;
      }
      event.preventDefault();
      commitListReorder((board?.lists.length ?? 1) - 1);
    },
    [board, dragContext, commitListReorder],
  );

  const handleListDrop = useCallback(
    (listId: number) => {
      const targetIndex = boardState?.lists.findIndex((list) => list.id === listId) ?? -1;
      if (targetIndex === -1) {
        return;
      }
      commitListReorder(targetIndex);
    },
    [boardState?.lists, commitListReorder],
  );

  const handleTaskDrop = useCallback(
    (listId: number, index: number) => {
      commitTaskReorder(listId, index);
    },
    [commitTaskReorder],
  );

  const handleTaskDragEnd = useCallback(() => {
    setDragContext(null);
    clearDropIndicators();
  }, [clearDropIndicators]);

  const handleListDragEnd = useCallback(() => {
    setDragContext(null);
    clearDropIndicators();
  }, [clearDropIndicators]);

  const handleListKeyboardMove = useCallback(
    (listId: number, direction: 'left' | 'right') => {
      const currentIndex = boardState?.lists.findIndex((list) => list.id === listId) ?? -1;
      if (currentIndex === -1) {
        return;
      }
      const delta = direction === 'left' ? -1 : 1;
      const targetIndex = currentIndex + delta;
      if (targetIndex < 0 || !boardState || targetIndex >= boardState.lists.length) {
        return;
      }
      commitListReorder(targetIndex);
    },
    [boardState, commitListReorder],
  );

  const handleTaskKeyboardMove = useCallback(
    (listId: number, taskId: number, direction: 'up' | 'down' | 'left' | 'right') => {
      const listIndex = boardState?.lists.findIndex((list) => list.id === listId) ?? -1;
      if (listIndex === -1 || !boardState) {
        return;
      }
      const list = boardState.lists[listIndex];
      const taskIndex = list.tasks.findIndex((task) => task.id === taskId);
      if (taskIndex === -1) {
        return;
      }

      if (direction === 'up' || direction === 'down') {
        const delta = direction === 'up' ? -1 : 1;
        const targetIndex = taskIndex + delta;
        commitTaskReorder(listId, targetIndex);
        return;
      }

      if (direction === 'left' || direction === 'right') {
        const listDelta = direction === 'left' ? -1 : 1;
        const targetList = boardState.lists[listIndex + listDelta];
        if (!targetList) {
          return;
        }
        commitTaskReorder(targetList.id, targetList.tasks.length);
      }
    },
    [boardState, commitTaskReorder],
  );
  const boardData = board;
  const isLoading = boardQuery.isLoading || profileQuery.isLoading;
  const error = boardQuery.error ?? profileQuery.error ?? null;
  const isOwner = boardData?.isOwner ?? false;
  const canShowAddListButton = Boolean(isOwner && showInlineAddListButton && !isListFormVisible);

  const myTasksButtonClassName = [
    'inline-flex items-center rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
    showMyTasksOnly
      ? 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400'
      : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800',
  ].join(' ');

  useEffect(() => {
    setRealtimeStatus(realtimeStatus);
  }, [realtimeStatus, setRealtimeStatus]);

  useEffect(() => () => {
    setRealtimeStatus('disconnected');
  }, [setRealtimeStatus]);

  return (
    <section className="flex flex-col gap-6">
      {toast ? (
        <div
          role="status"
          className={`fixed right-8 top-8 z-40 flex items-center gap-3 rounded-xl px-5 py-3 text-sm shadow-lg transition ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-600 text-white'
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
        <div className="flex gap-4 overflow-x-auto pb-2">
          <SkeletonColumn />
          <SkeletonColumn />
          <SkeletonColumn />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <h2 className="text-lg font-semibold">Не удалось загрузить доску.</h2>
          <p className="mt-2 text-sm">{error.message}</p>
          <button
            type="button"
            onClick={() => {
              boardQuery.refetch();
              profileQuery.refetch();
            }}
            className="mt-3 inline-flex items-center rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
          >
            Повторить попытку
          </button>
        </div>
      ) : null}

      {!isLoading && !error && boardData ? (
        <>
          {(isParticipant || canShowAddListButton) && (
            <div className="flex flex-wrap items-center gap-3">
              {canShowAddListButton ? (
                <button
                  type="button"
                  onClick={openListForm}
                  className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  Добавить колонку
                </button>
              ) : null}
              {isParticipant ? (
                <button
                  type="button"
                  className={myTasksButtonClassName}
                  onClick={toggleMyTasksOnly}
                  aria-pressed={showMyTasksOnly}
                >
                  Мои задачи
                </button>
              ) : null}
            </div>
          )}

          {isOwner && isListFormVisible ? (
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
            {boardData.lists.length === 0 ? (
              <div className="flex w-full min-w-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                Добавьте первую колонку, чтобы начать планирование.
              </div>
            ) : (
              boardData.lists.map((taskList) => (
                <TaskListColumn
                  key={taskList.id}
                  list={taskList}
                  isOwner={boardData.isOwner}
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
                  participants={participantsById}
                  taskPermissions={taskPermissions}
                  showMyTasksOnly={showMyTasksOnly}
                  myParticipantId={myParticipantId}
                  isTaskPending={isTaskPending}
                  onTakeTask={handleTakeTask}
                  onUpdateTaskStatus={handleStatusChange}
                  onStatusChangeDenied={handleStatusChangeDeniedMessage}
                  onDeleteTask={handleDeleteTask}
                  onDeleteTaskList={handleDeleteTaskList}
                  onTaskChanged={handleTaskChanged}
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








