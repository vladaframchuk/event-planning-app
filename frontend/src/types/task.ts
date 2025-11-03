import type { Role } from '@/types/event';

export type TaskStatus = 'todo' | 'doing' | 'done';

export type Task = {
  id: number;
  list: number;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee: number | null;
  startAt?: string | null;
  dueAt?: string | null;
  order: number;
  dependsOn: number[];
  createdAt: string;
  updatedAt: string;
};

export type BoardParticipant = {
  id: number;
  role: Role;
  user: {
    id: number;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
};

export type TaskList = {
  id: number;
  event: number;
  title: string;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Board = {
  event: { id: number; title: string };
  lists: Array<TaskList & { tasks: Task[] }>;
  isOwner: boolean;
  viewerRole: Role | null;
  participants: BoardParticipant[];
};

