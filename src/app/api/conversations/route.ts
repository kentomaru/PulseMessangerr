import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, conversationMembers, messages, users } from "@/db/schema";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

export const GET = withApi("conversations", async ({ me }) => {
  const myMemberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));

  if (myMemberships.length === 0) return NextResponse.json({ conversations: [] });

  const convIds = myMemberships.map((m) => m.conversationId);
  const lastReadMap = new Map(myMemberships.map((m) => [m.conversationId, m.lastReadAt]));

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

  // Непрочитанные: честный count относительно моего last_read_at (без ограничения на 400 сообщений)
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

  const result = convIds
    .map((cid) => {
      const members = allMembers.filter((r) => r.member.conversationId === cid);
      const peerRow = members.find((r) => r.user.id !== me.id);
      if (!peerRow) return null;
      const peer = {
        ...publicUser(peerRow.user),
        lastReadAt: peerRow.user.showReadReceipts ? peerRow.member.lastReadAt : null,
      };
      const lastMessage = lastMessageByConv.get(cid) ?? null;
      void lastReadMap;
      return {
        id: cid,
        peer,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              type: lastMessage.type,
              content: lastMessage.content,
              senderId: lastMessage.senderId,
              createdAt: lastMessage.createdAt,
            }
          : null,
        unreadCount: unreadByConv.get(cid) ?? 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a!.lastMessage ? new Date(a!.lastMessage.createdAt).getTime() : 0;
      const tb = b!.lastMessage ? new Date(b!.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ conversations: result });
});

export const POST = withApi("conversations:create", async ({ req, me, log }) => {
  const body = await req.json();
  const userId = String(body.userId ?? "");
  if (!userId || userId === me.id)
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });

  const peerRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const peer = peerRows[0];
  if (!peer) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // ищем существующий личный чат
  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));
  const peerConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  const peerSet = new Set(peerConvs.map((c) => c.conversationId));
  const shared = myConvs.map((c) => c.conversationId).filter((id) => peerSet.has(id));

  if (shared.length > 0) {
    return NextResponse.json({ conversation: { id: shared[0], peer: publicUser(peer) } });
  }

  // Приватность: пользователь запретил новые личные чаты
  if (!peer.allowMessages) {
    return NextResponse.json(
      { error: `${peer.displayName} запретил(а) новые личные чаты` },
      { status: 403 },
    );
  }

  const [conv] = await db.insert(conversations).values({ isGroup: false }).returning();
  await db.insert(conversationMembers).values([
    { conversationId: conv.id, userId: me.id },
    { conversationId: conv.id, userId },
  ]);
  log.info("Создан чат", { conversationId: conv.id, with: peer.username });

  return NextResponse.json({ conversation: { id: conv.id, peer: publicUser(peer) } });
});
