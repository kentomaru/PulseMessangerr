import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages, users } from "@/db/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId)
    return NextResponse.json({ error: "conversationId обязателен" }, { status: 400 });

  const membership = await assertMember(conversationId, me.id);
  if (!membership)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const list = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)),
    )
    .orderBy(asc(messages.createdAt))
    .limit(200);

  // mark as read + fetch peer read state
  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    );

  const peers = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        ne(conversationMembers.userId, me.id),
      ),
    );

  return NextResponse.json({
    messages: list,
    peer: peers[0]
      ? { ...publicUser(peers[0].user), lastReadAt: peers[0].member.lastReadAt }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json();
  const conversationId = String(body.conversationId ?? "");
  const type = body.type === "image" ? "image" : "text";
  const content = String(body.content ?? "").trim();

  if (!conversationId || !content)
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  if (content.length > 4000)
    return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });

  const membership = await assertMember(conversationId, me.id);
  if (!membership)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const [msg] = await db
    .insert(messages)
    .values({ conversationId, senderId: me.id, type, content })
    .returning();

  await db
    .update(conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    );

  return NextResponse.json({ message: msg });
}
