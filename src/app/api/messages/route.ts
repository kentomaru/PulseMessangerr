import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messageReactions, messages, users } from "@/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";
import {
  isManager,
  listMembers,
  memberItem,
  normalizeKind,
  normalizeRole,
} from "@/lib/conversations";
import { findActiveCall } from "@/lib/calls";
import type { ChatMessage, ConversationMemberItem, MessageReaction, ReplyPreview } from "@/lib/types";

async function assertMember(conversationId: string, userId: string) {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

type MessageRow = typeof messages.$inferSelect;
type UserRow = typeof users.$inferSelect;

function userMap(rows: UserRow[]) {
  return new Map(rows.map((u) => [u.id, u]));
}

function replyPreview(m: MessageRow, byId: Map<string, UserRow>): ReplyPreview | null {
  const sender = byId.get(m.senderId);
  return {
    id: m.id,
    senderId: m.senderId,
    senderName: sender?.displayName ?? "Пользователь",
    senderAvatar: sender?.avatarUrl ?? null,
    type: m.type,
    content: m.deletedAt ? "" : m.content,
    createdAt: new Date(m.createdAt).toISOString(),
    deleted: !!m.deletedAt,
  };
}

/** Реакции сообщения, агрегированные по эмодзи. */
function aggregateReactions(
  rows: (typeof messageReactions.$inferSelect)[],
  meId: string,
): MessageReaction[] {
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === meId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  return Array.from(byEmoji.entries())
    .map(([emoji, { count, mine }]) => ({ emoji, count, mine }))
    .sort((a, b) => b.count - a.count);
}

async function serializeMessages(list: MessageRow[], meId: string): Promise<ChatMessage[]> {
  const senderIds = Array.from(new Set(list.map((m) => m.senderId)));
  const replyIds = Array.from(new Set(list.map((m) => m.replyToId).filter((v): v is string => !!v)));
  const messageIds = list.map((m) => m.id);

  const senderRows = senderIds.length > 0 ? await db.select().from(users).where(inArray(users.id, senderIds)) : [];
  const replyRows = replyIds.length > 0
    ? await db.select().from(messages).where(inArray(messages.id, replyIds))
    : [];
  const replySenderIds = Array.from(new Set(replyRows.map((m) => m.senderId)));
  const replySenderRows = replySenderIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, replySenderIds))
    : [];
  const reactionRows = messageIds.length > 0
    ? await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds))
    : [];
  const reactionsByMessage = new Map<string, (typeof reactionRows)[number][]>();
  for (const r of reactionRows) {
    const arr = reactionsByMessage.get(r.messageId) ?? [];
    arr.push(r);
    reactionsByMessage.set(r.messageId, arr);
  }

  const senders = userMap([...senderRows, ...replySenderRows]);
  const replies = new Map(replyRows.map((m) => [m.id, m]));

  return list.map((m) => {
    const sender = senders.get(m.senderId);
    const reply = m.replyToId ? replies.get(m.replyToId) : undefined;
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      type: m.type as ChatMessage["type"],
      content: m.content,
      replyToId: m.replyToId,
      createdAt: new Date(m.createdAt).toISOString(),
      deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
      editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
      sender: sender ? publicUser(sender) : undefined,
      replyTo: reply ? replyPreview(reply, senders) : null,
      reactions: aggregateReactions(reactionsByMessage.get(m.id) ?? [], meId),
    };
  });
}

/**
 * GET /api/messages?conversationId=... — сообщения диалога (личные чаты, группы, каналы).
 * Вместе с сообщениями отдаёт карточку диалога, участников и живой звонок.
 */
export const GET = withApi("messages", async ({ req, me }) => {
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId)
    return NextResponse.json({ error: "conversationId обязателен" }, { status: 400 });
  if (!isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const membership = await assertMember(conversationId, me.id);
  if (!membership) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conv = convRows[0];
  if (!conv) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const kind = normalizeKind(conv.kind);

  // последние 200 сообщений (свежие), затем в хронологическом порядке
  const latest = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  const list = latest.reverse();

  // отмечаюсь как прочитавший
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    );

  const memberRows = await listMembers(conversationId);
  const members: ConversationMemberItem[] = memberRows.map((r) => memberItem(r.member, r.user));
  const peerRow = memberRows.find((r) => r.user.id !== me.id);

  const active = await findActiveCall(conversationId);

  return NextResponse.json({
    messages: await serializeMessages(list, me.id),
    conversation: {
      id: conv.id,
      kind,
      name: conv.name,
      avatarUrl: conv.avatarUrl,
      about: conv.about ?? "",
      isPrivate: !!conv.isPrivate,
      ownerId: conv.ownerId,
      memberCount: memberRows.length,
      myRole: normalizeRole(membership.role),
      title:
        kind === "direct"
          ? (peerRow?.user.displayName ?? "Чат")
          : (conv.name?.trim() || (kind === "channel" ? "Канал" : "Группа")),
    },
    members,
    peer: peerRow
      ? {
          ...publicUser(peerRow.user),
          lastReadAt: peerRow.member.lastReadAt,
          typingAt: peerRow.member.typingAt,
        }
      : null,
    activeCall: active
      ? {
          id: active.id,
          media: active.media === "video" ? "video" : "audio",
          status: active.status,
          hostId: active.hostId,
          joinToken: active.joinToken,
          participantCount: active.participantCount,
          startedAt: new Date(active.startedAt).toISOString(),
        }
      : null,
    wallpaper: membership.wallpaper ?? null,
  });
});

/** POST /api/messages — отправить сообщение { conversationId, type, content, replyToId }. */
export const POST = withApi("messages:send", async ({ req, me, log }) => {
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const ALLOWED_TYPES = ["text", "image", "voice", "video_note", "file"] as const;
  const type = ALLOWED_TYPES.includes(body.type) ? (body.type as (typeof ALLOWED_TYPES)[number]) : "text";
  const replyToId = typeof body.replyToId === "string" && isUuid(body.replyToId) ? body.replyToId : null;
  if (conversationId && !isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const content = String(body.content ?? "").trim();

  if (!conversationId || !content)
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  if (content.length > 4000)
    return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });

  // Для вложений content — JSON {url, ...} (у image допускается и просто url).
  // Проверяем, что url ведёт на наш файловый сервис, а не на внешний сайт.
  if (type !== "text") {
    let url: string | null = null;
    if (content.startsWith("/api/files/")) {
      url = content;
    } else {
      try {
        const parsed = JSON.parse(content) as { url?: unknown };
        if (typeof parsed.url === "string") url = parsed.url;
      } catch {
        url = null;
      }
    }
    if (!url || !url.startsWith("/api/files/") || !/^[a-zA-Z0-9-]+\.[a-z0-9]{1,8}$/i.test(url.slice("/api/files/".length))) {
      return NextResponse.json({ error: "Некорректная ссылка на файл" }, { status: 400 });
    }
  }

  const membership = await assertMember(conversationId, me.id);
  if (!membership) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conv = convRows[0];
  if (!conv) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  // Канал: писать могут только владелец и админы (остальные — подписчики)
  if (normalizeKind(conv.kind) === "channel" && !isManager(membership.role)) {
    return NextResponse.json(
      { error: "В этом канале писать могут только администраторы" },
      { status: 403 },
    );
  }

  if (replyToId) {
    const target = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, replyToId), eq(messages.conversationId, conversationId)))
      .limit(1);
    if (!target[0])
      return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
  }

  const [msg] = await db
    .insert(messages)
    .values({ conversationId, senderId: me.id, type, content, replyToId })
    .returning();

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date(), typingAt: null })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    );
  log.info("Сообщение отправлено", { conversationId, type, reply: String(!!replyToId) });

  const [serialized] = await serializeMessages([msg], me.id);
  return NextResponse.json({ message: serialized });
});
