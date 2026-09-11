import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Пользователи. Пароль хранится только в виде scrypt-хэша. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  bio: text("bio").notNull().default(""),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Приватность
  showOnline: boolean("show_online").notNull().default(true),
  allowCalls: boolean("allow_calls").notNull().default(true),
  allowMessages: boolean("allow_messages").notNull().default(true),
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

/** Диалоги (пока только личные чаты). */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  isGroup: boolean("is_group").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Звонки (WebRTC). Сервер — только «сигнальный центр»:
 * хранит SDP-описания и ICE-кандидаты, пока стороны обмениваются ими,
 * а сам аудио/видео поток идёт напрямую между браузерами (P2P).
 */
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    callerId: uuid("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calleeId: uuid("callee_id").references(() => users.id, { onDelete: "cascade" }),
    media: text("media").notNull().default("audio"), // audio | video
    status: text("status").notNull().default("ringing"), // ringing | active | ended | declined | missed
    offerSdp: text("offer_sdp"),
    answerSdp: text("answer_sdp"),
    callerIce: jsonb("caller_ice").$type<RTCIceCandidateInit[]>().notNull().default(sql`'[]'::jsonb`),
    calleeIce: jsonb("callee_ice").$type<RTCIceCandidateInit[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("calls_callee_idx").on(t.calleeId, t.status)],
);

export type Call = typeof calls.$inferSelect;

/** Участник чата: прогресс прочтения, индикатор «печатает», личные обои чата. */
export const conversationMembers = pgTable(
  "conversation_members",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
    typingAt: timestamp("typing_at", { withTimezone: true }),
    wallpaper: text("wallpaper"),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

/** Сообщения: text | image (content = url) | call (content = JSON-лог звонка). */
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** Ссылка на звонок, чтобы лог звонка не дублировался (unique-индекс ниже). */
    callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("messages_conversation_idx").on(t.conversationId, t.createdAt),
    uniqueIndex("messages_call_id_key").on(t.callId),
  ],
);

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
