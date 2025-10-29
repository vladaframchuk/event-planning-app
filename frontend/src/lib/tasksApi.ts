import { apiFetch } from '@/lib/fetcher';
import type { Board, Task, TaskList, TaskStatus } from '@/types/task';

type ApiTask = {
  id: number;
  list: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: number | null;
  start_at: string | null;
  due_at: string | null;
  order: number;
  depends_on: number[];
  created_at: string;
  updated_at: string;
};

type ApiTaskList = {
  id: number;
  event: number;
  title: string;
  order: number;
  created_at: string;
  updated_at: string;
};

type ApiBoard = {
  event: { id: number; title: string };
  lists: Array<ApiTaskList & { tasks: ApiTask[] }>;
  is_owner: boolean;
};

type CreateListPayload = {
  title: string;
};

type CreateTaskPayload = {
  list: number;
  title: string;
  description?: string;
  startAt?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  assignee?: number | null;
  dependsOn?: number[];
};

type UpdateTaskPayload = Partial<{
  list: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: number | null;
  startAt: string | null;
  dueAt: string | null;
  order: number;
  dependsOn: number[];
}>;

const TASKLIST_PATH = '/api/tasklists/';
const TASK_PATH = '/api/tasks/';

const mapTask = (payload: ApiTask): Task => ({
  id: payload.id,
  list: payload.list,
  title: payload.title,
  description: payload.description ?? undefined,
  status: payload.status,
  assignee: payload.assignee,
  startAt: payload.start_at,
  dueAt: payload.due_at,
  order: payload.order,
  dependsOn: payload.depends_on,
  createdAt: payload.created_at,
  updatedAt: payload.updated_at,
});

const mapTaskList = (payload: ApiTaskList): TaskList => ({
  id: payload.id,
  event: payload.event,
  title: payload.title,
  order: payload.order,
  createdAt: payload.created_at,
  updatedAt: payload.updated_at,
});

const mapBoard = (payload: ApiBoard): Board => ({
  event: payload.event,
  isOwner: payload.is_owner,
  lists: payload.lists.map((item) => ({
    ...mapTaskList(item),
    tasks: item.tasks.map(mapTask),
  })),
});

const serializeListPayload = (eventId: number, payload: CreateListPayload): Record<string, unknown> => ({
  event: eventId,
  title: payload.title,
});

const normalizeDescription = (value: string | null | undefined): string => {
  if (value === undefined) {
    return '';
  }
  return value ?? '';
};

const serializeTaskPayload = (
  payload: CreateTaskPayload | UpdateTaskPayload,
): Record<string, unknown> => {
  const body: Record<string, unknown> = {};

  if ('list' in payload && payload.list !== undefined) {
    body.list = payload.list;
  }
  if ('title' in payload && payload.title !== undefined) {
    body.title = payload.title;
  }
  if ('description' in payload && payload.description !== undefined) {
    body.description = normalizeDescription(payload.description);
  }
  if ('status' in payload && payload.status !== undefined) {
    body.status = payload.status;
  }
  if ('assignee' in payload && payload.assignee !== undefined) {
    body.assignee = payload.assignee;
  }
  if ('startAt' in payload && payload.startAt !== undefined) {
    body.start_at = payload.startAt;
  }
  if ('dueAt' in payload && payload.dueAt !== undefined) {
    body.due_at = payload.dueAt;
  }
  if ('order' in payload && payload.order !== undefined) {
    body.order = payload.order;
  }
  if ('dependsOn' in payload && payload.dependsOn !== undefined) {
    body.depends_on = payload.dependsOn;
  }

  return body;
};

export async function getBoard(eventId: number): Promise<Board> {
  const response = await apiFetch<ApiBoard>(`/api/events/${eventId}/board`, { method: 'GET' });
  return mapBoard(response);
}

export async function createList(eventId: number, payload: CreateListPayload): Promise<TaskList> {
  const body = JSON.stringify(serializeListPayload(eventId, payload));
  const response = await apiFetch<ApiTaskList>(TASKLIST_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return mapTaskList(response);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const body = JSON.stringify(serializeTaskPayload(payload));
  const response = await apiFetch<ApiTask>(TASK_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return mapTask(response);
}

export async function updateTask(id: number, payload: UpdateTaskPayload): Promise<Task> {
  const body = JSON.stringify(serializeTaskPayload(payload));
  const response = await apiFetch<ApiTask>(`${TASK_PATH}${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return mapTask(response);
}

export async function deleteTask(id: number): Promise<void> {
  await apiFetch<null>(`${TASK_PATH}${id}/`, { method: 'DELETE' });
}

