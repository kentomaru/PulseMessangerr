import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  conversations,
  conversationMembers,
  messages,
  users,
} from "@/db/schema";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const myMemberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));

  if (myMemberships.length === 0) return NextResponse.json({ conversations: [] });

  const convIds = myMemberships.map((m) => m.conversationId);
  const lastReadMap = new Map(
    myMemberships.map((m) => [m.conversationId, m.lastReadAt]),
  );

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
    .limit(400);

  const lastMessageByConv = new Map<string, (typeof recentMessages)[number]>();
  for (const m of recentMessages) {
    if (!lastMessageByConv.has(m.conversationId)) lastMessageByConv.set(m.conversationId, m);
  }

  const unreadRows = await db
    .select({
      conversationId: messages.conversationId,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(
      and(
        inArray(messages.conversationId, convIds),
        ne(messages.senderId, me.id),
        isNull(messages.deletedAt),
      ),
    )
    .groupBy(messages.conversationId);

  const result = convIds
    .map((cid) => {
      const members = allMembers.filter((r) => r.member.conversationId === cid);
      const peerRow = members.find((r) => r.user.id !== me.id);
      if (!peerRow) return null;
      const peer = { ...publicUser(peerRow.user), lastReadAt: peerRow.member.lastReadAt };
      const lastMessage = lastMessageByConv.get(cid) ?? null;
      const myLastRead = lastReadMap.get(cid) ?? new Date(0);
      const unreadRow = unreadRows.find((r) => r.conversationId === cid);
      const unreadCount =
        unreadRow && lastMessage && new Date(lastMessage.createdAt) > new Date(myLastRead)
          ? recentMessages.filter(
              (m) =>
                m.conversationId === cid &&
                m.senderId !== me.id &&
                new Date(m.createdAt) > new Date(myLastRead),
            ).length
          : 0;
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
        unreadCount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a!.lastMessage ? new Date(a!.lastMessage.createdAt).getTime() : 0;
      const tb = b!.lastMessage ? new Date(b!.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({ conversations: result });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json();
  const userId = String(body.userId ?? "");
  if (!userId || userId === me.id)
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });

  const peerRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!peerRows[0])
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  // find existing DM
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
    return NextResponse.json({
      conversation: { id: shared[0], peer: publicUser(peerRows[0]) },
    });
  }

  const [conv] = await db.insert(conversations).values({ isGroup: false }).returning();
  await db.insert(conversationMembers).values([
    { conversationId: conv.id, userId: me.id },
    { conversationId: conv.id, userId },
  ]);

  return NextResponse.json({
    conversation: { id: conv.id, peer: publicUser(peerRows[0]) },
  });
}
