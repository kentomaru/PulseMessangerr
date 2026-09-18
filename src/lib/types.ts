export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string;
  /** Кастомный статус-эмодзи: эмодзи или ссылка на анимированную гифку. */
  statusEmoji: string;
  nameColor?: string;
  /** null, если пользователь скрыл статус (приватность). */
  lastSeenAt: string | null;
  createdAt: string;
  online: boolean;
  showOnline: boolean;
  allowCalls: boolean;
  allowMessages: boolean;
  allowGroupInvites: boolean;
  /** Видно ли меня в глобальном поиске. Ссылка-инвайт работает всегда. */
  discoverable: boolean;
  /** Дата рождения (строка, необязательно). */
  birthday: string;
  /** Pulse Premium: длинные подписи к медиа и значок. */
  premium: boolean;
};

export type Peer = PublicUser & { lastReadAt?: string | null; typingAt?: string | null; recordingAt?: string | null };

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
  restricted?: boolean;
  slowMode?: number;
  /** Показывать ли участникам, кто владелец (канал). */
  showOwner?: boolean;
  ownerId: string | null;
  createdAt: string;
  memberCount: number;
  /** Моя роль в этом диалоге. */
  myRole: MemberRole;
  /** Заголовок для шапки/списка: имя собеседника или название группы. */
  title: string;
  /** Юзернейм/токен приглашения (@имя) — видят только владелец и админы. */
  inviteToken?: string | null;
};

export type ConversationMemberItem = {
  user: PublicUser;
  role: MemberRole;
  lastReadAt: string | null;
  typingAt: string | null;
  /** Записывает голосовое прямо сейчас (для индикатора у собеседника). */
  recordingAt?: string | null;
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
    /** Тихое сообщение — без звука. */
    silent?: boolean;
  } | null;
  unreadCount: number;
  activeCall: CallSummary | null;
  /** «Избранное» — личный чат с самим собой (сохранённые сообщения). */
  saved?: boolean;
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

/**
 * Вложение (голосовое, видеосообщение-«кружок», файл, фото с подписью).
 * В базе хранится как JSON в messages.content.
 */
export type AttachmentInfo = {
  url: string;
  name?: string;
  mimeType?: string;
  size?: number;
  /** Длительность в секундах (голосовые и кружки). */
  duration?: number;
  caption?: string;
  /** Картинка-стикер: рисуется крупно и без пузыря (гифки в т.ч.). */
  sticker?: boolean;
  /** Спойлер: размыто до клика. */
  spoiler?: boolean;
};

/** Реакция на сообщение (агрегированная по эмодзи). */
export type MessageReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  /** text | image (content = url или JSON) | voice | video_note | file | call | gift. */
  type: "text" | "image" | "voice" | "video_note" | "file" | "call" | "gift";
  content: string;
  replyToId: string | null;
  /** Тихое сообщение — без звука у получателей. */
  silent?: boolean;
  /** Просмотры поста канала («глазик» как в ТГ). */
  views?: number;
  createdAt: string;
  deletedAt: string | null;
  /** Когда сообщение отредактировано. */
  editedAt: string | null;
  /** Закреплено ли сообщение (плашка сверху чата). */
  pinned: boolean;
  /** Кто отправил (для групп/каналов). */
  sender?: PublicUser;
  /** Сообщение, на которое отвечает. */
  replyTo?: ReplyPreview | null;
  /** Реакции (эмодзи → сколько и есть ли моя). */
  reactions?: MessageReaction[];
  /** Голоса в опросе по вариантам (серверные) и мои выбранные варианты. */
  pollVotes?: number[];
  myPollVotes?: number[];
  /** Расшифровка голосового (хранится на сервере — видна всем). */
  transcript?: string | null;
  /** «Переслано от …» — ник автора оригинала. */
  forwardedFrom?: string | null;
  /** Аватарка автора оригинала при пересылке. */
  forwardedAvatar?: string | null;
  /** Автор оригинала при пересылке (чтобы открыть его профиль). */
  forwardedUser?: PublicUser | null;
  /** Id автора оригинала (передаётся дальше по цепочке пересылок). */
  forwardedUserId?: string | null;
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
  /** Демонстрирует ли участник экран (replaceTrack на видеодорожке). */
  screenOn: boolean;
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
