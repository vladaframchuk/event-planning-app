export type PollType = 'date' | 'place' | 'custom';

export type PollOption = {
  id: number;
  label?: string;
  dateValue?: string;
  votesCount: number;
};

export type Poll = {
  id: number;
  event: number;
  type: PollType;
  question: string;
  multiple: boolean;
  allowChangeVote: boolean;
  isClosed: boolean;
  endAt?: string | null;
  createdAt: string;
  options: PollOption[];
  totalVotes: number;
  myVotes: number[];
  leaderOptionIds: number[];
  version: number;
};
