export type EventOwner = {
  id: number;
  email: string;
};

export type Event = {
  id: number;
  title: string;
  category: string | null;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  owner: EventOwner;
  createdAt: string;
  updatedAt: string;
};

export type EventInput = {
  title?: string;
  category?: string | null;
  description?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
};
