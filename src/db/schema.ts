import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    about: text("about").notNull().default(""),
    accent: text("accent").notNull().default("violet"),
    emoji: text("emoji").notNull().default("⚡"),
    avatarFileId: integer("avatar_file_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_handle_idx").on(t.handle)],
);

export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // image | video | file | audio
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull().default(0),
  data: text("data").notNull(), // base64 payload
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("direct"), // direct | group
  title: text("title"),
  emoji: text("emoji").notNull().default("💬"),
  accent: text("accent").notNull().default("violet"),
  avatarFileId: integer("avatar_file_id"),
  ownerId: integer("owner_id"),
  wallpaper: text("wallpaper"), // json string, default for everyone
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    wallpaper: text("wallpaper"), // json string, personal override
    muted: boolean("muted").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_members_unique_idx").on(t.chatId, t.userId),
    index("chat_members_user_idx").on(t.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    senderId: integer("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    kind: text("kind").notNull().default("text"), // text | system
    replyToId: integer("reply_to_id"),
    deletedForAllAt: timestamp("deleted_for_all_at", { withTimezone: true }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_chat_idx").on(t.chatId, t.id),
    index("messages_updated_idx").on(t.chatId, t.updatedAt),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("attachments_message_idx").on(t.messageId)],
);

export const reactions = pgTable(
  "reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

export const hiddenMessages = pgTable(
  "hidden_messages",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

export const blocks = pgTable(
  "blocks",
  {
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const typingEvents = pgTable(
  "typing_events",
  {
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.userId] })],
);

export const userSettings = pgTable(
  "user_settings",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .primaryKey(),
    theme: text("theme").notNull().default("midnight"),
    accent: text("accent").notNull().default("violet"),
    wallpaper: text("wallpaper").notNull().default('{"preset":"aurora"}'),
    bubbleStyle: text("bubble_style").notNull().default("glass"),
    fontSize: text("font_size").notNull().default("md"),
    density: text("density").notNull().default("comfy"),
    enterToSend: boolean("enter_to_send").notNull().default(true),
    sounds: boolean("sounds").notNull().default(true),
    notifications: boolean("notifications").notNull().default(true),
    messagePreview: boolean("message_preview").notNull().default(true),
    readReceipts: boolean("read_receipts").notNull().default(true),
    typingStatus: boolean("typing_status").notNull().default(true),
    lastSeenPrivacy: text("last_seen_privacy").notNull().default("everyone"),
    autoDownload: text("auto_download").notNull().default("always"),
    language: text("language").notNull().default("ru"),
    animations: boolean("animations").notNull().default(true),
    largeEmoji: boolean("large_emoji").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Settings = typeof userSettings.$inferSelect;

export const calls = pgTable(
  "calls",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    callerId: integer("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("ringing"), // ringing | active | ended | declined | missed
    offerSdp: text("offer_sdp"),
    answerSdp: text("answer_sdp"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("calls_chat_idx").on(t.chatId, t.status)],
);

export type Call = typeof calls.$inferSelect;
