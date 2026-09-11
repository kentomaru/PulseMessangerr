export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  lastSeenAt: string;
  createdAt: string;
  online: boolean;
};

export type Peer = PublicUser & { lastReadAt?: string };

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text" | "image" | "call";
  content: string;
  createdAt: string;
  deletedAt: string | null;
};

export type ConversationListItem = {
  id: string;
  peer: Peer;
  lastMessage: {
    id: string;
    type: string;
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
};

export type CallPayload = {
  id: string;
  conversationId: string;
  callerId: string;
  status: "ringing" | "active" | "ended" | "declined" | "missed";
  offerSdp: string | null;
  answerSdp: string | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  caller?: PublicUser;
};

export type ActiveCall = {
  id: string;
  conversationId: string;
  role: "caller" | "callee";
  phase: "outgoing" | "incoming" | "connecting" | "active" | "ended";
  peer: PublicUser;
};
