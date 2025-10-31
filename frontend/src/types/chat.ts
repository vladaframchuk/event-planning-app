export type ChatMessage = {
  id: number;
  event: number;
  author: number;
  authorName: string;
  authorAvatar?: string | null;
  isMe: boolean;
  text: string;
  createdAt: string;
  editedAt?: string | null;
};

