// Даты указываются в формате ISO 8601 (строка, например "2025-10-26T12:00:00Z").

export type Event = {
  id: number;
  title: string;
  category?: string;
  description?: string;
  startAt?: string;
  endAt?: string;
  location?: string;
  ownerId: number;
};

export type Participant = {
  id: number;
  eventId: number;
  userId: number;
  role: 'organizer' | 'member';
  joinedAt: string;
};
