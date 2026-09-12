import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messages, users } from "@/db/schema";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";
import {
  findUsersByIds,
  memberItem,
  newInviteToken,
  normalizeKind,
  normalizeRole,
  serializeConversation,
} from "@/lib/conversations";
import { sweepStaleCalls, toCallSummaries } from "@/lib/calls";
import type { ConversationListItem, Peer } from "@/lib/types";

/**
 * GET /api/conversations — список моих диалогов (личные чаты, группы, каналы)
 * с последним сообщением, числом непрочитанных и живым звонком в каждом.
 */
export const GET = withApi("conversations", async ({ me }) => {
  const myMemberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));

  if (myMemberships.length === 0) return NextResponse.json({ conversations: [] });

  const convIds = myMemberships.map((m) => m.conversationId);
  const myRoleById = new Map(myMemberships.map((m) => [m.conversationId, normalizeRole(m.role)]));

  const convs = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, convIds));

  const allMembers = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(inArray(conversationMembers.conversationId, convIds));

  const recentMessages = await db
    .select()
    .from(messages)
    .where(and(inArray(messages.conversationId, convIds), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(500);

  const lastMessageByConv = new Map<string, (typeof recentMessages)[number]>();
  for (const m of recentMessages) {
    if (!lastMessageByConv.has(m.conversationId)) lastMessageByConv.set(m.conversationId, m);
  }

  // Непрочитанные: честный count относительно моего last_read_at
  const unreadRows = await db
    .select({ conversationId: messages.conversationId, count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .where(
      and(
        inArray(messages.conversationId, convIds),
        ne(messages.senderId, me.id),
        isNull(messages.deletedAt),
        gt(messages.createdAt, conversationMembers.lastReadAt),
      ),
    )
    .groupBy(messages.conversationId);
  const unreadByConv = new Map(unreadRows.map((r) => [r.conversationId, Number(r.count)]));

  const memberCounts = await db
    .select({ conversationId: conversationMembers.conversationId, n: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(inArray(conversationMembers.conversationId, convIds))
    .groupBy(conversationMembers.conversationId);
  const countByConv = new Map(memberCounts.map((r) => [r.conversationId, Number(r.n)]));

  // Живые звонки (заодно убираем «мёртвые» комнаты)
  const activeCalls = await toCallSummaries(await sweepStaleCalls(convIds));

  const userNameById = new Map(allMembers.map((r) => [r.user.id, r.user.displayName]));

  const result: ConversationListItem[] = [];
  for (const conv of convs) {
    const kind = normalizeKind(conv.kind);
    const rows = allMembers.filter((r) => r.member.conversationId === conv.id);
    const peerRow = rows.find((r) => r.user.id !== me.id);

    // «Избранное» — личный чат с самим собой: я в нём единственный участник
    const isSaved = kind === "direct" && !peerRow && rows.length === 1 && rows[0].user.id === me.id;

    // В личном чате без собеседника делать нечего (аккаунт удалён / вышел)
    if (kind === "direct" && !peerRow && !isSaved) continue;

    const peer: Peer | null = peerRow
      ? {
          ...publicUser(peerRow.user),
          lastReadAt: peerRow.member.lastReadAt
            ? new Date(peerRow.member.lastReadAt).toISOString()
            : null,
          typingAt: peerRow.member.typingAt ? new Date(peerRow.member.typingAt).toISOString() : null,
        }
      : isSaved
        ? {
            ...publicUser(me),
            lastReadAt: rows[0].member.lastReadAt
              ? new Date(rows[0].member.lastReadAt).toISOString()
              : null,
            typingAt: null,
          }
        : null;
    const lastMessage = lastMessageByConv.get(conv.id) ?? null;

    result.push({
      id: conv.id,
      kind,
      name: conv.name,
      avatarUrl: conv.avatarUrl ?? peerRow?.user.avatarUrl ?? null,
      isPrivate: !!conv.isPrivate,
      memberCount: countByConv.get(conv.id) ?? rows.length,
      myRole: myRoleById.get(conv.id) ?? "member",
      title:
        isSaved
          ? "Избранное"
          : kind === "direct"
            ? (peer?.displayName ?? "Чат")
            : (conv.name?.trim() || (kind === "channel" ? "Канал" : "Группа")),
      peer: (peer ?? ({ displayName: "—" } as Peer)),
      members: rows.map((r) => memberItem(r.member, r.user)),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            type: lastMessage.type,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            senderName: userNameById.get(lastMessage.senderId) ?? null,
            createdAt: new Date(lastMessage.createdAt).toISOString(),
          }
        : null,
      unreadCount: unreadByConv.get(conv.id) ?? 0,
      activeCall: activeCalls.get(conv.id) ?? null,
      saved: isSaved,
    });
  }

  result.sort((a, b) => {
    const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ conversations: result });
});

/**
 * POST /api/conversations — создать диалог.
 *  { userId }                                       → личный чат;
 *  { kind: "group"|"channel", name, memberIds[], isPrivate, about, avatarUrl }
 *                                                   → группа или канал.
 */
export const POST = withApi("conversations:create", async ({ req, me, log }) => {
  const body = await req.json().catch(() => ({}));
  const kind = normalizeKind(body.kind);

  /* ── Группа / канал ── */
  if (kind === "group" || kind === "channel") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (name.length < 2)
      return NextResponse.json({ error: "Название должно быть не короче 2 символов" }, { status: 400 });
    const about = String(body.about ?? "").trim().slice(0, 280);
    const avatarUrl =
      typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("/api/files/")
        ? body.avatarUrl
        : null;
    const isPrivate = body.isPrivate === undefined ? true : !!body.isPrivate;

    const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const invited = (await findUsersByIds(memberIds)).filter((u) => u.id !== me.id);
    if (invited.length > 200)
      return NextResponse.json({ error: "Слишком много участников" }, { status: 400 });
    // Приватность: пользователи, запретившие добавление в группы, не приглашаются.
    const blocked = invited.filter((u) => !u.allowGroupInvites);
    if (blocked.length > 0) {
      const names = blocked.map((u) => `@${u.username}`).join(", ");
      return NextResponse.json(
        {
          error: `Нельзя добавить: ${names} запретили добавление в группы в настройках приватности`,
        },
        { status: 403 },
      );
    }

    const [conv] = await db
      .insert(conversations)
      .values({
        kind,
        isGroup: kind === "group",
        name,
        about,
        avatarUrl,
        isPrivate,
        ownerId: me.id,
        inviteToken: newInviteToken(),
      })
      .returning();

    await db.insert(conversationMembers).values([
      { conversationId: conv.id, userId: me.id, role: "owner" },
      ...invited.map((u) => ({ conversationId: conv.id, userId: u.id, role: "member" as const })),
    ]);

    log.info(kind === "channel" ? "Канал создан" : "Группа создана", {
      conversationId: conv.id,
      by: me.username,
      members: String(invited.length + 1),
      private: String(isPrivate),
    });

    return NextResponse.json({
      conversation: await serializeConversation(conv, me.id),
    });
  }

  /* ── Личный чат ── */
  const userId = String(body.userId ?? "");
  if (!userId || !isUuid(userId))
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });

  /* ── «Избранное»: личный чат с самим собой (для сохранения сообщений) ── */
  if (userId === me.id) {
    // ищем существующий чат, где я единственный участник
    const selfRows = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationMembers,
        eq(conversationMembers.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.kind, "direct"),
          eq(conversationMembers.userId, me.id),
          sql`not exists (select 1 from conversation_members m2 where m2.conversation_id = ${conversations.id} and m2.user_id <> ${me.id})`,
        ),
      )
      .limit(1);
    if (selfRows[0]) {
      return NextResponse.json({
        conversation: { id: selfRows[0].id, peer: publicUser(me), kind: "direct" as const, saved: true },
      });
    }
    const [saved] = await db
      .insert(conversations)
      .values({ kind: "direct", isGroup: false, isPrivate: true, ownerId: me.id })
      .returning();
    await db
      .insert(conversationMembers)
      .values({ conversationId: saved.id, userId: me.id, role: "member" });
    log.info("Создано «Избранное»", { conversationId: saved.id, userId: me.id });
    return NextResponse.json({
      conversation: { id: saved.id, peer: publicUser(me), kind: "direct" as const, saved: true },
    });
  }

  const peerRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const peer = peerRows[0];
  if (!peer) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // ищем существующий личный чат с этим человеком
  const shared = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationMembers,
      eq(conversationMembers.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversations.kind, "direct"),
        eq(conversationMembers.userId, me.id),
        sql`exists (select 1 from conversation_members m2 where m2.conversation_id = ${conversations.id} and m2.user_id = ${userId})`,
      ),
    )
    .limit(1);

  if (shared[0]) {
    return NextResponse.json({
      conversation: { id: shared[0].id, peer: publicUser(peer), kind: "direct" as const },
    });
  }

  // Приватность: пользователь запретил новые личные чаты
  if (!peer.allowMessages) {
    return NextResponse.json(
      { error: `${peer.displayName} запретил(а) новые личные чаты` },
      { status: 403 },
    );
  }

  const [conv] = await db
    .insert(conversations)
    .values({ kind: "direct", isGroup: false, isPrivate: true, ownerId: null })
    .returning();
  await db.insert(conversationMembers).values([
    { conversationId: conv.id, userId: me.id, role: "member" },
    { conversationId: conv.id, userId, role: "member" },
  ]);
  log.info("Создан чат", { conversationId: conv.id, with: peer.username });

  return NextResponse.json({
    conversation: { id: conv.id, peer: publicUser(peer), kind: "direct" as const },
  });
});
