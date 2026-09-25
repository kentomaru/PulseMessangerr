import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messageReactions, messages, pollVotes, userBlocks, users } from "@/db/schema";
import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";
import {
  DISCUSSION_MARKER,
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
  const senderIds = Array.from(
    new Set([
      ...list.map((m) => m.senderId),
      ...list.map((m) => (m as { forwardedUserId?: string | null }).forwardedUserId).filter((v): v is string => !!v),
    ]),
  );
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

  // Голоса в опросах — серверные, все участники видят одинаково
  const pollIds = list
    .filter((m) => m.type === "text" && String(m.content ?? "").startsWith("poll:"))
    .map((m) => m.id);
  const voteRows =
    pollIds.length > 0
      ? await db.select().from(pollVotes).where(inArray(pollVotes.messageId, pollIds))
      : [];
  const votesByMessage = new Map<string, { option: number; userId: string }[]>();
  for (const v of voteRows) {
    const arr = votesByMessage.get(v.messageId) ?? [];
    arr.push({ option: v.option, userId: v.userId });
    votesByMessage.set(v.messageId, arr);
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
      quoteText: (m as { quoteText?: string | null }).quoteText ?? null,
      silent: !!(m as { silent?: boolean }).silent,
      views: (m as { views?: number }).views ?? 0,
      createdAt: new Date(m.createdAt).toISOString(),
      deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
      editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
      pinned: !!m.pinnedAt,
      transcript: (m as { transcript?: string | null }).transcript ?? null,
      forwardedFrom: (m as { forwardedFrom?: string | null }).forwardedFrom ?? null,
      forwardedAvatar: (m as { forwardedAvatar?: string | null }).forwardedAvatar ?? null,
      forwardedUserId: (m as { forwardedUserId?: string | null }).forwardedUserId ?? null,
      forwardedUser: (() => {
        const fid = (m as { forwardedUserId?: string | null }).forwardedUserId;
        const fu = fid ? senders.get(fid) : undefined;
        return fu ? publicUser(fu) : null;
      })(),
      sender: sender ? publicUser(sender) : undefined,
      replyTo: reply ? replyPreview(reply, senders) : null,
      reactions: aggregateReactions(reactionsByMessage.get(m.id) ?? [], meId),
      ...pollFields(m, votesByMessage.get(m.id), meId),
    };
  });
}

/** Счётчики голосов опроса + свои голоса — для синхронного отображения всем. */
function pollFields(
  m: MessageRow,
  votes: { option: number; userId: string }[] | undefined,
  meId: string,
): { pollVotes?: number[]; myPollVotes?: number[] } {
  if (!votes) return {};
  let len = 10;
  try {
    const p = JSON.parse(String(m.content).slice(5)) as { opts?: unknown[] };
    if (Array.isArray(p.opts)) len = Math.min(10, Math.max(2, p.opts.length));
  } catch {
    /* не распарсилось */
  }
  const counts = new Array(len).fill(0) as number[];
  const mine: number[] = [];
  for (const v of votes) {
    if (v.option >= 0 && v.option < len) counts[v.option] += 1;
    if (v.userId === meId) mine.push(v.option);
  }
  return { pollVotes: counts, myPollVotes: mine.sort((a, b) => a - b) };
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

  // фильтр «комментарии поста»: &replyToId=<postId> (обсуждение канала)
  const replyToFilter = req.nextUrl.searchParams.get("replyToId");

  // последние 200 сообщений (свежие), затем в хронологическом порядке
  const latest = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        replyToFilter && isUuid(replyToFilter) ? eq(messages.replyToId, replyToFilter) : undefined,
      ),
    )
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
  // «Избранное» — личный чат с самим собой (единственный участник — я)
  const isSaved = kind === "direct" && !peerRow && memberRows.length === 1;

  const active = await findActiveCall(conversationId);

  // Сколько записей/сообщений в чате — для «Записи · N» у каналов и групп
  const postCountRows = await db
    .select({ n: count() })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        ne(messages.type, "call"),
      ),
    );
  const postCount = postCountRows[0]?.n ?? 0;

  // Закреплённые сообщения (плашка сверху чата)
  const pinnedRows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        isNotNull(messages.pinnedAt),
      ),
    )
    .orderBy(desc(messages.pinnedAt))
    .limit(10);

  const serialized = await serializeMessages(list, me.id);

  // Группа-обсуждение канала: посты, зеркаленные из канала (тихие),
  // показываются от имени КАНАЛА, а не человека — как в ТГ.
  if (kind === "group" && (conv.about ?? "").startsWith(DISCUSSION_MARKER)) {
    const channelId = (conv.about ?? "").slice(DISCUSSION_MARKER.length);
    if (isUuid(channelId)) {
      const [channel] = await db
        .select({ name: conversations.name })
        .from(conversations)
        .where(eq(conversations.id, channelId))
        .limit(1);
      if (channel?.name) {
        for (const m of serialized) {
          // Копируем объект: оригинал разделяется с обычными сообщениями автора
          if (m.silent && m.sender) {
            m.sender = { ...m.sender, displayName: channel.name, avatarUrl: null };
          }
        }
      }
    }
  }

  return NextResponse.json({
    postCount,
    messages: serialized,
    pinned: await serializeMessages(pinnedRows, me.id),
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
          ? isSaved
            ? "Избранное"
            : (peerRow?.user.displayName ?? "Чат")
          : (conv.name?.trim() || (kind === "channel" ? "Канал" : "Группа")),
    },
    members,
    peer: peerRow
      ? {
          ...publicUser(peerRow.user),
          lastReadAt: peerRow.member.lastReadAt,
          typingAt: peerRow.member.typingAt,
        }
      : isSaved
        ? {
            ...publicUser(me),
            lastReadAt: membership.lastReadAt,
            typingAt: membership.typingAt,
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
/**
 * Идемпотентность отправки: клиент шлёт с сообщением случайный clientKey.
 * Если прокси/браузер повторил POST (перезапрос по таймауту), мы не создаём
 * ДУБЛЬ, а возвращаем уже созданное сообщение. Храним ключи 2 минуты.
 */
const recentKeys = new Map<string, { messageId: string; at: number }>();
function rememberKey(key: string, messageId: string) {
  recentKeys.set(key, { messageId, at: Date.now() });
  if (recentKeys.size > 800) {
    const cutoff = Date.now() - 120_000;
    for (const [k, v] of recentKeys) if (v.at < cutoff) recentKeys.delete(k);
  }
}

export const POST = withApi("messages:send", async ({ req, me, log }) => {
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  // Повторная доставка того же запроса — возвращаем существующее сообщение
  const clientKey = typeof body.clientKey === "string" ? body.clientKey.slice(0, 64) : "";
  if (clientKey) {
    const seen = recentKeys.get(clientKey);
    if (seen && Date.now() - seen.at < 120_000) {
      const rows = await db.select().from(messages).where(eq(messages.id, seen.messageId)).limit(1);
      if (rows[0]) {
        const [serialized] = await serializeMessages([rows[0]], me.id);
        return NextResponse.json({ message: serialized });
      }
    }
  }
  const ALLOWED_TYPES = ["text", "image", "voice", "video_note", "file", "gift"] as const;
  const type = ALLOWED_TYPES.includes(body.type) ? (body.type as (typeof ALLOWED_TYPES)[number]) : "text";
  const replyToId = typeof body.replyToId === "string" && isUuid(body.replyToId) ? body.replyToId : null;
  const quoteText =
    typeof body.quoteText === "string" && body.quoteText.trim() ? body.quoteText.trim().slice(0, 500) : null;
  const silent = body.silent === true;
  /** Расшифровка голосового, собранная прямо во время записи (до 2000 симв.). */
  const transcript =
    typeof body.transcript === "string" && body.transcript.trim()
      ? body.transcript.trim().slice(0, 2000)
      : null;
  /** «Переслано от …» — ник автора оригинала при пересылке. */
  const forwardedFrom =
    typeof body.forwardedFrom === "string" && body.forwardedFrom.trim()
      ? body.forwardedFrom.trim().slice(0, 64)
      : null;
  const forwardedAvatar =
    typeof body.forwardedAvatar === "string" && body.forwardedAvatar.trim()
      ? body.forwardedAvatar.trim().slice(0, 512)
      : null;
  const forwardedUserId =
    typeof body.forwardedUserId === "string" && isUuid(body.forwardedUserId)
      ? body.forwardedUserId
      : null;
  if (conversationId && !isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const content = String(body.content ?? "").trim();

  // Заблокированный администрацией чат/канал — писать нельзя
  if (conversationId && isUuid(conversationId)) {
    const [bannedConv] = await db
      .select({ bannedAt: conversations.bannedAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (bannedConv?.bannedAt) {
      return NextResponse.json(
        { error: "Этот чат заблокирован администрацией" },
        { status: 403 },
      );
    }
  }

  // Чёрный список: в личном чате заблокированные не переписываются
  if (conversationId && isUuid(conversationId)) {
    const [convRow] = await db
      .select({ kind: conversations.kind })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (convRow && normalizeKind(convRow.kind) === "direct") {
      const memberIds = (
        await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, conversationId))
      ).map((m) => m.userId);
      const peerId = memberIds.find((id) => id !== me.id);
      if (peerId) {
        // Удалённому или заблокированному аккаунту писать нельзя (как и звонить)
        const [peerRow] = await db
          .select({ bannedAt: users.bannedAt, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, peerId))
          .limit(1);
        if (peerRow && (peerRow.bannedAt || peerRow.deletedAt)) {
          return NextResponse.json(
            { error: "Этот аккаунт удалён или заблокирован — написать нельзя" },
            { status: 403 },
          );
        }
        const [block] = await db
          .select()
          .from(userBlocks)
          .where(
            or(
              and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, peerId)),
              and(eq(userBlocks.blockerId, peerId), eq(userBlocks.blockedId, me.id)),
            ),
          )
          .limit(1);
        if (block)
          return NextResponse.json(
            { error: "Сообщения недоступны: вы в чёрном списке" },
            { status: 403 },
          );
      }
    }
  }

  if (!conversationId || !content)
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  // Подписи к медиа: до 1024 символов (2048 с Pulse Premium) — как в Telegram.
  if (content.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as { caption?: unknown };
      const cap = typeof parsed.caption === "string" ? parsed.caption : "";
      const limit = me.premium ? 2048 : 1024;
      if (cap.length > limit)
        return NextResponse.json(
          {
            error: me.premium
              ? `Подпись к медиа — не больше ${limit} символов`
              : `Подпись к медиа — не больше 1024 символов (с Pulse Premium — 2048)`,
          },
          { status: 400 },
        );
    } catch {
      /* не JSON — обычный текст, проверяется ниже */
    }
  }

  if (content.length > 4096)
    return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });

  // Для вложений content — JSON {url, ...} (у image допускается и просто url).
  // Проверяем, что url ведёт на наш файловый сервис, а не на внешний сайт.
  if (type !== "text" && type !== "gift") {
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
      .select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(and(eq(messages.id, replyToId), isNull(messages.deletedAt)))
      .limit(1);
    if (!target[0])
      return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
    if (target[0].conversationId !== conversationId) {
      // Разрешаем отвечать на пост канала из его чата-обсуждения
      const [targetConv] = await db
        .select({ kind: conversations.kind })
        .from(conversations)
        .where(eq(conversations.id, target[0].conversationId))
        .limit(1);
      const about = conv?.about ?? "";
      const isCommentToPost =
        normalizeKind(targetConv?.kind ?? "") === "channel" &&
        about === DISCUSSION_MARKER + target[0].conversationId;
      if (!isCommentToPost)
        return NextResponse.json({ error: "Сообщение для ответа не найдено" }, { status: 404 });
    }
  }

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: me.id,
      type,
      content,
      replyToId,
      quoteText,
      silent,
      transcript: type === "voice" ? transcript : null,
      forwardedFrom,
      forwardedAvatar,
      forwardedUserId,
    })
    .returning();
  if (clientKey) rememberKey(clientKey, msg.id);

  // Как в Telegram: пост канала дублируется в привязанную группу-обсуждение,
  // чтобы участники группы видели пост и могли его обсуждать.
  if (!replyToId) {
    try {
      const [postConv] = await db
        .select({ kind: conversations.kind })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (postConv && normalizeKind(postConv.kind) === "channel") {
        const [disc] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.about, DISCUSSION_MARKER + conversationId))
          .limit(1);
        if (disc) {
          await db.insert(messages).values({
            conversationId: disc.id,
            senderId: me.id,
            type,
            content,
            silent: true,
          });
        }
      }
    } catch {
      /* зеркало — не критично */
    }
  }

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
