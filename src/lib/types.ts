export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  /** null, если пользователь скрыл статус (приватность). */
  lastSeenAt: string | null;
  createdAt: string;
  online: boolean;
  showOnline: boolean;
  allowCalls: boolean;
  allowMessages: boolean;
  showReadReceipts: boolean;
  allowStories: boolean;
};

export type Peer = PublicUser & { lastReadAt?: string | null; typingAt?: string | null };

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text" | "image" | "video" | "file" | "voice" | "voice-circle" | "call";
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

export type CallMedia = "audio" | "video";
export type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed";

export type CallPayload = {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string | null;
  media: CallMedia;
  status: CallStatus;
  offerSdp: string | null;
  answerSdp: string | null;
  callerIce: RTCIceCandidateInit[];
  calleeIce: RTCIceCandidateInit[];
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
  media: CallMedia;
};

/** JSON, который хранится в сообщении типа «call». */
export type CallLogInfo = {
  callId?: string;
  status: "ended" | "missed" | "declined" | "cancelled";
  durationSec: number;
  callerId: string;
  media: CallMedia;
};

export type StoryItem = {
  id: string;
  userId: string;
  mediaUrl: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number;
};

export type StoryGroup = {
  user: PublicUser;
  stories: StoryItem[];
};
