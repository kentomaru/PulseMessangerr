import { cookies } from "next/headers";
import { db } from "@/db";
import {
  attachments,
  blocks,
  chats,
  chatMembers,
  files,
  hiddenMessages,
  messages,
  reactions,
  typingEvents,
  userSettings,
  users,
  type Settings,
} from "@/db/schema";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import type {
  AttachmentPayload,
  ChatPayload,
  MessagePayload,
  ReactionPayload,
  SettingsPayload,
} from "./pulse";

export const SESSION_COOKIE = "pulse_uid";

export type SessionUser = {
  id: number;
  name: string;
  handle: string;
  about: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
  lastSeenAt: string;
};

const SEED_USERS = [
  { name: "Алиса Ветрова", handle: "alice", emoji: "🌊", accent: "cyan", about: "Дизайн, серфинг и медленный кофе" },
  { name: "Марк Ли", handle: "mark", emoji: "🎧", accent: "emerald", about: "Собираю плейлисты и басы" },
  { name: "Даша Ким", handle: "dasha", emoji: "🍭", accent: "rose", about: "Фронтенд, коты, рамён" },
  { name: "Тимур Асланов", handle: "timur", emoji: "🚀", accent: "amber", about: "Продукт, метрики, дедлайны" },
];

export const DEMO_USER_ID = 1;

export async function ensureSeed(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const inserted = await db
    .insert(users)
    .values(SEED_USERS)
    .returning();
  const byHandle = new Map(inserted.map((u) => [u.handle, u]));
  const alice = byHandle.get("alice")!;
  const mark = byHandle.get("mark")!;
  const dasha = byHandle.get("dasha")!;
  const timur = byHandle.get("timur")!;

  await db.insert(userSettings).values(
    inserted.map((u) => ({
      userId: u.id,
      accent: u.accent,
      theme: "midnight",
      wallpaper: JSON.stringify({ preset: u.handle === "alice" ? "aurora" : "ocean" }),
    })),
  );

  const groupIns = await db
    .insert(chats)
    .values({
      kind: "group",
      title: "Команда Pulse",
      emoji: "⚡",
      accent: "violet",
      ownerId: alice.id,
    })
    .returning();
  const group = groupIns[0];

  await db.insert(chatMembers).values([
    { chatId: group.id, userId: alice.id, role: "owner" },
    { chatId: group.id, userId: mark.id, role: "admin" },
    { chatId: group.id, userId: dasha.id, role: "member" },
    { chatId: group.id, userId: timur.id, role: "member" },
  ]);

  const dmSeed: { a: number; b: number; lines: [number, string][] }[] = [
    {
      a: alice.id,
      b: mark.id,
      lines: [
        [mark.id, "Привет! Скинул тебе новый плейлист 🎧"],
        [alice.id, "Ого, уже слушаю. Bassline прям то, что нужно"],
        [mark.id, "Тогда жду фидбек до вечера 😄"],
      ],
    },
    {
      a: alice.id,
      b: dasha.id,
      lines: [
        [dasha.id, "Алис, посмотри макет онбординга?"],
        [alice.id, "Смотрю. Давай градиент мягче и побольше воздуха"],
        [dasha.id, "Сделаю к вечеру, спасибо! 🍭"],
      ],
    },
    {
      a: alice.id,
      b: timur.id,
      lines: [
        [timur.id, "Релиз в пятницу, держим темп 🚀"],
        [alice.id, "Принято, закрываю последние правки"],
      ],
    },
  ];

  const now = Date.now();
  for (const seed of dmSeed) {
    const ins = await db
      .insert(chats)
      .values({ kind: "direct", accent: "violet" })
      .returning();
    const chat = ins[0];
    await db.insert(chatMembers).values([
      { chatId: chat.id, userId: seed.a },
      { chatId: chat.id, userId: seed.b },
    ]);
    await db.insert(messages).values(
      seed.lines.map(([senderId, body], i) => ({
        chatId: chat.id,
        senderId,
        body,
        createdAt: new Date(now - (seed.lines.length - i) * 1000 * 60 * 37),
        updatedAt: new Date(now - (seed.lines.length - i) * 1000 * 60 * 37),
      })),
    );
  }

  await db.insert(messages).values(
    [
      { chatId: group.id, senderId: alice.id, body: "Всем привет! ⚡ Добро пожаловать в Pulse" },
      { chatId: group.id, senderId: mark.id, body: "Красиво выглядит, особенно обои 🔥" },
      { chatId: group.id, senderId: dasha.id, body: "Обожаю, что можно прикреплять файлы прямо в сообщение" },
      { chatId: group.id, senderId: timur.id, body: "Главное — ответы на сообщения, наконец-то порядок 🚀" },
    ].map((row, i) => ({
      ...row,
      createdAt: new Date(now - (4 - i) * 1000 * 60 * 55),
      updatedAt: new Date(now - (4 - i) * 1000 * 60 * 55),
    })),
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const id = Number(raw);
  if (!raw || !Number.isFinite(id)) return null;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      handle: users.handle,
      about: users.about,
      emoji: users.emoji,
      accent: users.accent,
      avatarFileId: users.avatarFileId,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return { ...row, lastSeenAt: row.lastSeenAt.toISOString() };
}

export async function touchPresence(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId));
}

export function settingsToPayload(row: Settings): SettingsPayload {
  return {
    theme: row.theme,
    accent: row.accent,
    wallpaper: row.wallpaper,
    bubbleStyle: row.bubbleStyle,
    fontSize: row.fontSize,
    density: row.density,
    enterToSend: row.enterToSend,
    sounds: row.sounds,
    notifications: row.notifications,
    messagePreview: row.messagePreview,
    readReceipts: row.readReceipts,
    typingStatus: row.typingStatus,
    lastSeenPrivacy: row.lastSeenPrivacy,
    autoDownload: row.autoDownload,
    language: row.language,
    animations: row.animations,
    largeEmoji: row.largeEmoji,
  };
}

export async function getSettings(userId: number): Promise<Settings> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (rows.length > 0) return rows[0];
  const ins = await db.insert(userSettings).values({ userId }).returning();
  return ins[0];
}

type RawMemberRow = {
  chat_id: number;
  last_read_message_id: number;
  unread: string;
  last_message_id: number | null;
};

export async function loadChats(userId: number): Promise<ChatPayload[]> {
  const raw = await db.execute(sql`
    select cm.chat_id,
           cm.last_read_message_id,
           coalesce((select count(*)::int from messages m
                     where m.chat_id = cm.chat_id
                       and m.id > cm.last_read_message_id
                       and m.sender_id <> ${userId}
                       and m.deleted_for_all_at is null
                       and not exists (select 1 from hidden_messages h
                                       where h.message_id = m.id and h.user_id = ${userId})), 0)::int as unread,
           (select max(m2.id) from messages m2
             where m2.chat_id = cm.chat_id
               and not exists (select 1 from hidden_messages h2
                               where h2.message_id = m2.id and h2.user_id = ${userId})) as last_message_id
    from chat_members cm
    where cm.user_id = ${userId}
  `);
  const memberRows = (raw.rows as unknown as RawMemberRow[]) ?? [];
  if (memberRows.length === 0) return [];

  const chatIds = memberRows.map((r) => r.chat_id);
  const chatRows = await db.select().from(chats).where(inArray(chats.id, chatIds));
  const memberMeta = await db
    .select()
    .from(chatMembers)
    .where(and(inArray(chatMembers.chatId, chatIds), eq(chatMembers.userId, userId)));

  const lastIds = memberRows.map((r) => r.last_message_id).filter((v): v is number => !!v);
  const lastMsgRows = lastIds.length
    ? await db.select().from(messages).where(inArray(messages.id, lastIds))
    : [];

  const directChatIds = chatRows.filter((c) => c.kind === "direct").map((c) => c.id);
  const partnerRows = directChatIds.length
    ? await db
        .select({
          chatId: chatMembers.chatId,
          id: users.id,
          name: users.name,
          handle: users.handle,
          emoji: users.emoji,
          accent: users.accent,
          avatarFileId: users.avatarFileId,
          lastSeenAt: users.lastSeenAt,
          about: users.about,
        })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(and(inArray(chatMembers.chatId, directChatIds), sql`${chatMembers.userId} <> ${userId}`))
    : [];

  const blockRows = await db
    .select()
    .from(blocks)
    .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)));
  const blockedSet = new Set(blockRows.filter((b) => b.blockerId === userId).map((b) => b.blockedId));
  const blockedBySet = new Set(blockRows.filter((b) => b.blockedId === userId).map((b) => b.blockerId));

  const chatMap = new Map(chatRows.map((c) => [c.id, c]));
  const msgMap = new Map(lastMsgRows.map((m) => [m.id, m]));
  const metaMap = new Map(memberMeta.map((m) => [m.chatId, m]));
  const partnerMap = new Map(partnerRows.map((p) => [p.chatId, p]));

  const result: ChatPayload[] = [];
  for (const row of memberRows) {
    const chat = chatMap.get(row.chat_id);
    if (!chat) continue;
    const meta = metaMap.get(row.chat_id);
    const last = row.last_message_id ? msgMap.get(row.last_message_id) : undefined;
    const partner = partnerMap.get(row.chat_id) ?? null;
    result.push({
      id: chat.id,
      kind: chat.kind,
      title: chat.title ?? "",
      emoji: chat.emoji,
      accent: chat.accent,
      avatarFileId: chat.avatarFileId,
      wallpaper: meta?.wallpaper ?? chat.wallpaper ?? null,
      muted: meta?.muted ?? false,
      pinned: meta?.pinned ?? false,
      archived: meta?.archived ?? false,
      unread: Number(row.unread ?? 0),
      lastMessage: last
        ? {
            id: last.id,
            senderId: last.senderId,
            body: last.body,
            kind: last.kind,
            createdAt: last.createdAt.toISOString(),
            deletedForAllAt: last.deletedForAllAt ? last.deletedForAllAt.toISOString() : null,
          }
        : null,
      partner: partner
        ? {
            id: partner.id,
            name: partner.name,
            handle: partner.handle,
            emoji: partner.emoji,
            accent: partner.accent,
            avatarFileId: partner.avatarFileId,
            lastSeenAt: partner.lastSeenAt.toISOString(),
            about: partner.about,
          }
        : null,
      blocked: partner ? blockedSet.has(partner.id) : false,
      blockedBy: partner ? blockedBySet.has(partner.id) : false,
    });
  }

  result.sort((a, b) => {
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bt - at;
  });
  return result;
}

export type LoadMessagesOptions = {
  after?: number;
  limit?: number;
  since?: string;
};

export async function loadMessages(
  chatId: number,
  userId: number,
  options: LoadMessagesOptions = {},
): Promise<{ messages: MessagePayload[]; updates: MessagePayload[] }> {
  const limit = options.limit ?? 200;
  const visible = sql`not exists (select 1 from hidden_messages hm where hm.message_id = ${messages.id} and hm.user_id = ${userId})`;

  const baseRows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        options.after ? gt(messages.id, options.after) : undefined,
        visible,
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit);

  let updateRows: (typeof messages.$inferSelect)[] = [];
  if (options.since) {
    updateRows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.chatId, chatId),
          options.after ? sql`${messages.id} <= ${options.after}` : undefined,
          gt(messages.updatedAt, new Date(options.since)),
          visible,
        ),
      )
      .orderBy(asc(messages.id))
      .limit(300);
  }

  const fresh = baseRows.slice().reverse();
  return {
    messages: await hydrateMessages(fresh, userId),
    updates: await hydrateMessages(updateRows, userId),
  };
}

export async function hydrateMessages(
  rows: (typeof messages.$inferSelect)[],
  userId: number,
): Promise<MessagePayload[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [attRows, reactionRows, userRows] = await Promise.all([
    db
      .select({
        messageId: attachments.messageId,
        id: attachments.id,
        fileId: files.id,
        sortOrder: attachments.sortOrder,
        kind: files.kind,
        name: files.name,
        mime: files.mime,
        size: files.size,
        width: files.width,
        height: files.height,
        duration: files.duration,
      })
      .from(attachments)
      .innerJoin(files, eq(files.id, attachments.fileId))
      .where(inArray(attachments.messageId, ids)),
    db.select().from(reactions).where(inArray(reactions.messageId, ids)),
    db
      .select({
        id: users.id,
        name: users.name,
        handle: users.handle,
        emoji: users.emoji,
        accent: users.accent,
        avatarFileId: users.avatarFileId,
      })
      .from(users)
      .where(
        inArray(
          users.id,
          Array.from(new Set(rows.map((r) => r.senderId))),
        ),
      ),
  ]);

  const replyIds = Array.from(
    new Set(rows.map((r) => r.replyToId).filter((v): v is number => !!v)),
  );
  const replyRows = replyIds.length
    ? await db.select().from(messages).where(inArray(messages.id, replyIds))
    : [];
  const replyAttRows = replyIds.length
    ? await db
        .select({ messageId: attachments.messageId, kind: files.kind })
        .from(attachments)
        .innerJoin(files, eq(files.id, attachments.fileId))
        .where(inArray(attachments.messageId, replyIds))
    : [];
  const replyMap = new Map(replyRows.map((r) => [r.id, r]));
  const replySenders = new Set(replyRows.map((r) => r.senderId));
  const extraUsers = replySenders.size
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, Array.from(replySenders)))
    : [];
  const extraUserMap = new Map(extraUsers.map((u) => [u.id, u.name]));

  const attMap = new Map<number, AttachmentPayload[]>();
  for (const a of attRows) {
    const list = attMap.get(a.messageId) ?? [];
    list.push({
      id: a.id,
      fileId: a.fileId,
      kind: a.kind as AttachmentPayload["kind"],
      name: a.name,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      duration: a.duration,
    });
    attMap.set(a.messageId, list);
  }
  for (const list of attMap.values()) list.sort((x, y) => x.id - y.id);

  const replyAttKind = new Map<number, AttachmentPayload["kind"]>();
  for (const a of replyAttRows) {
    if (!replyAttKind.has(a.messageId)) replyAttKind.set(a.messageId, a.kind as AttachmentPayload["kind"]);
  }

  const reactionMap = new Map<number, ReactionPayload[]>();
  for (const r of reactionRows) {
    const list = reactionMap.get(r.messageId) ?? [];
    const found = list.find((l) => l.emoji === r.emoji);
    if (found) found.users.push(r.userId);
    else list.push({ emoji: r.emoji, users: [r.userId] });
    reactionMap.set(r.messageId, list);
  }

  const userMap = new Map(
    userRows.map((u) => [
      u.id,
      {
        id: u.id,
        name: u.name,
        handle: u.handle,
        emoji: u.emoji,
        accent: u.accent,
        avatarFileId: u.avatarFileId,
      },
    ]),
  );

  return rows.map((r) => {
    const reply = r.replyToId ? replyMap.get(r.replyToId) : undefined;
    const replyAttachments = reply ? attMap.get(reply.id) : undefined;
    return {
      id: r.id,
      chatId: r.chatId,
      senderId: r.senderId,
      body: r.body,
      kind: r.kind,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      deletedForAllAt: r.deletedForAllAt ? r.deletedForAllAt.toISOString() : null,
      replyToId: r.replyToId,
      replyTo: reply
        ? {
            id: reply.id,
            senderId: reply.senderId,
            senderName: extraUserMap.get(reply.senderId) ?? "Пользователь",
            body: reply.deletedForAllAt ? "" : reply.body,
            kind: reply.kind,
            attachmentKind: replyAttachments?.[0]?.kind ?? replyAttKind.get(reply.id) ?? null,
            deleted: !!reply.deletedForAllAt,
          }
        : null,
      attachments: attMap.get(r.id) ?? [],
      reactions: reactionMap.get(r.id) ?? [],
      sender:
        userMap.get(r.senderId) ?? {
          id: r.senderId,
          name: "Пользователь",
          handle: "user",
          emoji: "🙂",
          accent: "violet",
          avatarFileId: null,
        },
    };
  });
}

export async function getMessageById(id: number): Promise<MessagePayload | null> {
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (rows.length === 0) return null;
  const [hydrated] = await hydrateMessages(rows, rows[0].senderId);
  return hydrated ?? null;
}

export async function assertMembership(chatId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: chatMembers.id })
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function getBlockStatus(
  userId: number,
  otherId: number,
): Promise<{ blocked: boolean; blockedBy: boolean }> {
  const rows = await db
    .select()
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userId), eq(blocks.blockedId, otherId)),
        and(eq(blocks.blockerId, otherId), eq(blocks.blockedId, userId)),
      ),
    );
  return {
    blocked: rows.some((r) => r.blockerId === userId),
    blockedBy: rows.some((r) => r.blockedId === userId),
  };
}

export async function loadTyping(chatId: number, excludeUserId: number) {
  const cutoff = new Date(Date.now() - 7000);
  const rows = await db
    .select({ name: users.name, emoji: users.emoji })
    .from(typingEvents)
    .innerJoin(users, eq(users.id, typingEvents.userId))
    .where(
      and(
        eq(typingEvents.chatId, chatId),
        sql`${typingEvents.userId} <> ${excludeUserId}`,
        gt(typingEvents.updatedAt, cutoff),
      ),
    );
  return rows;
}

export async function findDirectChat(aId: number, bId: number): Promise<number | null> {
  const rows = await db.execute(sql`
    select c.id from chats c
    where c.kind = 'direct'
      and exists (select 1 from chat_members m1 where m1.chat_id = c.id and m1.user_id = ${aId})
      and exists (select 1 from chat_members m2 where m2.chat_id = c.id and m2.user_id = ${bId})
    limit 1
  `);
  const first = (rows.rows as unknown as { id: number }[])[0];
  return first ? Number(first.id) : null;
}

export async function deleteChatForUser(chatId: number, userId: number): Promise<void> {
  const messageIds = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  if (messageIds.length > 0) {
    await db
      .insert(hiddenMessages)
      .values(messageIds.map((m) => ({ messageId: m.id, userId })))
      .onConflictDoNothing();
  }
  await db
    .delete(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));

  const remaining = await db
    .select({ id: chatMembers.id })
    .from(chatMembers)
    .where(eq(chatMembers.chatId, chatId))
    .limit(1);
  if (remaining.length === 0) {
    await db.delete(chats).where(eq(chats.id, chatId));
  }
}

export async function deleteChatForEveryone(chatId: number): Promise<void> {
  await db.delete(chats).where(eq(chats.id, chatId));
}
