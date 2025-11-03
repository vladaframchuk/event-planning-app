export type EventOwner = {
  id: number;
  email: string;
};

export type Role = 'organizer' | 'member';

export type EventParticipantUser = {
  id: number;
  email: string;
  name: string | null;
  avatar?: string | null;
};

export type Participant = {
  id: number;
  role: Role;
  joinedAt: string;
  user: EventParticipantUser;
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
  viewerRole?: Role | null;
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
