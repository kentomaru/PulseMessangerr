import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages, users } from "@/db/schema";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";
import { encodeImageMessage, isUploadUrl } from "@/lib/message-content";

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

export const GET = withApi("messages", async ({ req, me }) => {
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  if (!conversationId)
    return NextResponse.json({ error: "conversationId обязателен" }, { status: 400 });
  if (!isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const membership = await assertMember(conversationId, me.id);
  if (!membership) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  // последние 200 сообщений (свежие), затем в хронологическом порядке
  const latest = await db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  const list = latest.reverse();

  // отмечаюсь как прочитавший (typingAt не трогаем — индикатор «печатает»
  // живёт, пока пользователь печатает, и сам «протухает» на клиенте)
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
        eq(conversationMembers.userId, conversationMembers.userId),
        ne(conversationMembers.userId, me.id),
      ),
    );

  return NextResponse.json({
    messages: list,
    peer: peers[0]
      ? {
          ...publicUser(peers[0].user),
          lastReadAt: peers[0].member.lastReadAt,
          typingAt: peers[0].member.typingAt,
        }
      : null,
    wallpaper: membership.wallpaper ?? null,
  });
});

export const POST = withApi("messages:send", async ({ req, me, log }) => {
  const body = await req.json();
  const conversationId = String(body.conversationId ?? "");
  const type = body.type === "image" ? "image" : "text";
  if (conversationId && !isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const content = String(body.content ?? "").trim();
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";

  if (!conversationId || !content)
    return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });
  if (content.length > 4000)
    return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });
  if (caption.length > 4000)
    return NextResponse.json({ error: "Подпись слишком длинная" }, { status: 400 });
  if (type === "image" && !isUploadUrl(content))
    return NextResponse.json({ error: "Некорректная ссылка на изображение" }, { status: 400 });

  const membership = await assertMember(conversationId, me.id);
  if (!membership) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const storedContent = type === "image" ? encodeImageMessage(content, caption) : content;
  const [msg] = await db
    .insert(messages)
    .values({ conversationId, senderId: me.id, type, content: storedContent })
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
  log.info("Сообщение отправлено", { conversationId, type });

  return NextResponse.json({ message: msg });
});
