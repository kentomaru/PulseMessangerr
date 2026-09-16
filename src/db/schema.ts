import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Колонка «сырые байты» (bytea).postgres.js отдаёт и принимает Buffer. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** Пользователи. Пароль хранится только в виде scrypt-хэша. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  bio: text("bio").notNull().default(""),
  /** Pulse Premium: выдаётся бесплатно, расширяет лимиты. */
  premium: boolean("premium").notNull().default(false),
  // Pulse Premium: цвет имени в чатах (как «цвет профиля» в ТГ)
  nameColor: text("name_color"),
  // Кастомный статус-эмодзи в профиле: обычный эмодзи («🔥») или ссылка
  // на загруженную АНИМИРОВАННУЮ гифку (/api/files/…).
  statusEmoji: text("status_emoji").notNull().default(""),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Приватность
  showOnline: boolean("show_online").notNull().default(true),
  allowCalls: boolean("allow_calls").notNull().default(true),
  allowMessages: boolean("allow_messages").notNull().default(true),
  allowGroupInvites: boolean("allow_group_invites").notNull().default(true),
    /** Приватность: видно ли в поиске. Ссылка-инвайт работает всегда. */
    discoverable: boolean("discoverable").notNull().default(true),
    birthday: text("birthday").notNull().default(""),
});

export type User = typeof users.$inferSelect;

/** Сессии (cookie pulse_session → пользователь). */
export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Тип диалога: личный чат, группа (общаются все) или канал (пишут админы). */
export type ConversationKind = "direct" | "group" | "channel";
/** Роль участника в группе/канале. */
export type MemberRole = "owner" | "admin" | "member";

/**
 * Диалоги: личные чаты, группы и каналы (как в Discord/Telegram).
 * isPrivate=true — «приватный»: его не видно в поиске/обнаружении,
 * попасть внутрь можно только по приглашению или ссылке-инвайту.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("direct"), // direct | group | channel
    /** Оставлено для совместимости со старыми запросами/данными. */
    isGroup: boolean("is_group").notNull().default(false),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    about: text("about").notNull().default(""),
    isPrivate: boolean("is_private").notNull().default(true),
    /** Токен постоянной ссылки-приглашения: /#group=<token>. */
    inviteToken: text("invite_token").unique(),
    /** «Запретить копирование/сохранение» — как ограниченные каналы в ТГ. */
    restricted: boolean("restricted").notNull().default(false),
  // Минимальная пауза между сообщениями участников (сек, 0 — выключен)
  slowMode: integer("slow_mode").notNull().default(0),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_kind_idx").on(t.kind, t.isPrivate)],
);

export type Conversation = typeof conversations.$inferSelect;

/** Участник чата: роль, прогресс прочтения, «печатает», личные обои чата. */
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    typingAt: timestamp("typing_at", { withTimezone: true }),
    /** Последняя активность записи голосового (для индикатора у собеседника). */
    recordingAt: timestamp("recording_at", { withTimezone: true }),
    wallpaper: text("wallpaper"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("conversation_members_user_idx").on(t.userId),
  ],
);

export type ConversationMember = typeof conversationMembers.$inferSelect;

/**
 * Звонки. Одна строка = одна «комната» на диалог: в ней может быть
 * сколько угодно участников (mesh-WebRTC, медиа идёт напрямую между браузерами).
 * Сервер хранит только сигнальную информацию (SDP/ICE) и состав комнаты.
 */
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Инициатор звонка (в логе сообщения — «кто звонил»). */
    hostId: uuid("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    media: text("media").notNull().default("audio"), // audio | video
    /** ringing — звонит одному человеку (ЛС), live — групповая комната. */
    status: text("status").notNull().default("live"), // ringing | live | ended | declined | missed
    /** Короткий токен публичной ссылки-приглашения: /#join=<token>. */
    joinToken: text("join_token").notNull().unique(),
    /** Сколько человек побывало в звонке (для красивого лога в чате). */
    participantCount: integer("participant_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("calls_conversation_idx").on(t.conversationId, t.status),
    index("calls_join_token_idx").on(t.joinToken),
  ],
);

export type Call = typeof calls.$inferSelect;

/** Участник звонка + его сигнальное состояние (SDP, флаг видео, heartbeat). */
export const callParticipants = pgTable(
  "call_participants",
  {
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SDP-оффер, который этот участник опубликовал для остальных. */
    sdp: text("sdp"),
    /** Включена ли камера (видно всем, чтобы рисовать плитку/аватар). */
    videoOn: boolean("video_on").notNull().default(false),
    muted: boolean("muted").notNull().default(false),
    /** Демонстрирует ли участник свой экран (replaceTrack на видеодорожке). */
    screenOn: boolean("screen_on").notNull().default(false),
    /** Присоединился по ссылке, не будучи участником чата. */
    guest: boolean("guest").notNull().default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    /** Последний опрос клиента: по нему сервер понимает, что звонок «умер». */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.callId, t.userId] }),
    index("call_participants_user_idx").on(t.userId),
  ],
);

export type CallParticipant = typeof callParticipants.$inferSelect;

/**
 * Сигнальные сообщения между двумя участниками звонка
 * (answer/offer/ice). Очередь на пару (call, from, to) — забирается опросом.
 */
export const callSignals = pgTable(
  "call_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // offer | answer | ice
    payload: jsonb("payload").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("call_signals_to_idx").on(t.callId, t.toUserId, t.readAt)],
);

export type CallSignal = typeof callSignals.$inferSelect;

/** Приглашения в звонок (ссылка «присоединиться» для конкретных людей). */
export const callInvites = pgTable(
  "call_invites",
  {
    callId: uuid("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.callId, t.userId] }),
    index("call_invites_user_idx").on(t.userId),
  ],
);

/**
 * Сообщения: text | image (content = url или JSON) | voice | video_note («кружок»)
 *          | file (content = JSON) | call (content = JSON-лог звонка).
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("text"),
    content: text("content").notNull(),
    /** Ответ на другое сообщение (reply/quote). */
    replyToId: uuid("reply_to_id"),
    /** Тихое сообщение: без звука у получателей. */
    silent: boolean("silent").notNull().default(false),
    /** Сколько раз просмотрели пост канала (как в ТГ — «глазик»). */
    views: integer("views").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    /** Закреплено ли сообщение (показывается в плашке сверху чата). */
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    /** Ссылка на звонок, чтобы лог звонка не дублировался (unique-индекс ниже). */
    callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
    /** Расшифровка голосового — хранится на сервере, видна всем. */
    transcript: text("transcript"),
    /** «Переслано от …» — ник автора оригинала (как в ТГ). */
    forwardedFrom: text("forwarded_from"),
    /** Аватарка автора оригинала при пересылке. */
    forwardedAvatar: text("forwarded_avatar"),
    /** Id автора оригинала — чтобы по «Переслано от» открывался профиль. */
    forwardedUserId: uuid("forwarded_user_id"),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    index("messages_reply_idx").on(t.replyToId),
    uniqueIndex("messages_call_id_key").on(t.callId),
  ],
);

export type Message = typeof messages.$inferSelect;

/** Реакции на сообщения (как в Discord/Telegram): (сообщение, пользователь, эмодзи). */
export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
    index("message_reactions_message_idx").on(t.messageId),
  ],
);

export type MessageReaction = typeof messageReactions.$inferSelect;

/** Истории (как в Telegram): фото + подпись, исчезают через 24 часа. */
export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaUrl: text("media_url").notNull(),
    caption: text("caption").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("stories_user_idx").on(t.userId, t.createdAt)],
);

/** Просмотры историй (кто видел). */
export const storyViews = pgTable(
  "story_views",
  {
    storyId: uuid("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.userId] })],
);

/**
 * Загруженные файлы (аватары, баннеры, истории, вложения).
 *
 * Байты хранятся прямо в Postgres: на Railway/в контейнерах файловая система
 * эфемерная — после каждого редеплоя/рестарта папка data/uploads очищалась,
 * и ВСЕ загруженные картинки («истории, фото, баннеры») переставали грузиться
 * (404). База — единственное надёжное хранилище в таком окружении.
 * Диск остаётся быстрым кэшем (см. маршруты upload/files).
 */
export const files = pgTable("files", {
  name: text("name").primaryKey(),
  data: bytea("data").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Короткий уникальный токен для ссылок-приглашений.
 * Используется Web Crypto API — он есть и в Node, и в edge-рантайме,
 * поэтому файл схемы остаётся безопасным для любой сборки.
 */
export function newJoinToken(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Заявки в друзья (статусы: pending | accepted). */
export const friendRequests = pgTable(
  "friend_requests",
  {
    fromId: uuid("from_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] })],
);

/** Чёрный список: блокирующий не шлёт/не получает личные сообщения. */
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

/** Голоса в опросах: по одной строке на выбранный вариант. */
export const pollVotes = pgTable(
  "poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    option: integer("option").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Подарки как в ТГ: премиум дарит друзьям, подарки видны в профиле. */
export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    giftKey: text("gift_key").notNull(),
    message: text("message"),
    /** «Скрыть моё имя» как в ТГ — получатель видит «Аноним». */
    hideSender: boolean("hide_sender").notNull().default(false),
    /** Закреплён в витрине профиля — показывается первым. */
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
