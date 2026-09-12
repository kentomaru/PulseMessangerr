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
};

export type Peer = PublicUser & { lastReadAt?: string | null; typingAt?: string | null };

export type ConversationKind = "direct" | "group" | "channel";
export type MemberRole = "owner" | "admin" | "member";

/** Диалог глазами клиента (личный чат, группа или канал). */
export type ConversationInfo = {
  id: string;
  kind: ConversationKind;
  name: string | null;
  avatarUrl: string | null;
  about: string;
  isPrivate: boolean;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
  /** Моя роль в этом диалоге. */
  myRole: MemberRole;
  /** Заголовок для шапки/списка: имя собеседника или название группы. */
  title: string;
};

export type ConversationMemberItem = {
  user: PublicUser;
  role: MemberRole;
  lastReadAt: string | null;
  typingAt: string | null;
  joinedAt: string;
};

/** Краткая сводка о живом звонке в диалоге (для списков и шапки чата). */
export type CallSummary = {
  id: string;
  media: CallMedia;
  status: CallStatus;
  participantCount: number;
  hostId: string;
  joinToken: string;
  startedAt: string;
};

export type ConversationListItem = {
  id: string;
  kind: ConversationKind;
  /** Название группы/канала; для личного чата — null. */
  name: string | null;
  avatarUrl: string | null;
  isPrivate: boolean;
  memberCount: number;
  myRole: MemberRole;
  title: string;
  /** Собеседник (для личного чата — второй участник). */
  peer: Peer;
  /** Участники группы/канала (для личного чата — только собеседник). */
  members: ConversationMemberItem[];
  lastMessage: {
    id: string;
    type: string;
    content: string;
    senderId: string;
    senderName: string | null;
    createdAt: string;
  } | null;
  unreadCount: number;
  activeCall: CallSummary | null;
};

export type ReplyPreview = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  type: string;
  content: string;
  createdAt: string;
  deleted: boolean;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text" | "image" | "call";
  content: string;
  replyToId: string | null;
  createdAt: string;
  deletedAt: string | null;
  /** Кто отправил (для групп/каналов). */
  sender?: PublicUser;
  /** Сообщение, на которое отвечает. */
  replyTo?: ReplyPreview | null;
};

export type CallMedia = "audio" | "video";
/** ringing — 1:1 дозвон, live — комната активна, ended/declined/missed — завершён. */
export type CallStatus = "ringing" | "live" | "ended" | "declined" | "missed";

export type CallParticipantInfo = {
  userId: string;
  user: PublicUser;
  sdp: string | null;
  videoOn: boolean;
  muted: boolean;
  guest: boolean;
  joinedAt: string;
  left: boolean;
};

export type SignalInfo = {
  id: string;
  from: string;
  kind: "offer" | "answer" | "ice";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
};

/** Ответ GET /api/calls/[id] — всё, что нужно клиенту для mesh-звонка. */
export type CallState = {
  call: {
    id: string;
    conversationId: string;
    hostId: string;
    media: CallMedia;
    status: CallStatus;
    joinToken: string;
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    conversationTitle: string;
    conversationKind: ConversationKind;
  };
  participants: CallParticipantInfo[];
  /** Моя строка участника (включая опубликованный мной SDP). */
  me: CallParticipantInfo | null;
  /** Сигналы, адресованные мне (answer/ice от других участников). */
  signals: SignalInfo[];
};

/** Входящий звонок (ещё не присоединился). */
export type IncomingCall = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationKind: ConversationKind;
  conversationAvatar: string | null;
  media: CallMedia;
  status: CallStatus;
  joinToken: string;
  hostId: string;
  host: PublicUser | null;
  participants: CallParticipantInfo[];
  startedAt: string;
};

/** JSON, который хранится в сообщении типа «call». */
export type CallLogInfo = {
  callId?: string;
  status: "ended" | "missed" | "declined" | "cancelled";
  durationSec: number;
  callerId: string;
  media: CallMedia;
  /** Сколько человек было в звонке (>2 — групповой). */
  participants?: number;
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

/** Публичная группа/канал в «Обзоре» (поиск по названию). */
export type DiscoverItem = {
  id: string;
  kind: ConversationKind;
  name: string;
  avatarUrl: string | null;
  about: string;
  memberCount: number;
  isPrivate: boolean;
  joined: boolean;
};
