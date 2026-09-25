import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * GET /api/messages/[id] — метаданные сообщения для перехода по ссылке
 * (#msg=<id>): в каком оно чате и когда отправлено.
 */
export const GET = withApi<{ id: string }>("messages:locate", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg || msg.deletedAt)
    return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (membership.length === 0)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  return NextResponse.json({
    message: {
      id: msg.id,
      conversationId: msg.conversationId,
      createdAt: new Date(msg.createdAt).toISOString(),
    },
  });
});

/**
 * PATCH /api/messages/[id] — редактирование своего сообщения.
 *  — text: новый текст (до 4000 символов);
 *  — image/file: новая подпись (content — JSON, url сохраняется);
 *  — voice/video_note/call: редактировать нельзя.
 */
export const PATCH = withApi<{ id: string }>("messages:edit", async ({ req, params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newText = String(body.content ?? "").trim();

  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const msg = rows[0];
  if (!msg || msg.deletedAt) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  if (msg.senderId !== me.id)
    return NextResponse.json({ error: "Редактировать можно только свои сообщения" }, { status: 403 });

  // доступ к чату всё ещё должен быть
  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!membership[0]) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (newText.length > 4000)
    return NextResponse.json({ error: "Слишком длинное сообщение" }, { status: 400 });

  let content = newText;
  if (msg.type === "image" || msg.type === "file") {
    // сохраняем вложение, меняем только подпись
    let parsed: { url?: unknown } = {};
    if (msg.content.trimStart().startsWith("{")) {
      try {
        parsed = JSON.parse(msg.content);
      } catch {
        parsed = {};
      }
    }
    const url = typeof parsed.url === "string" ? parsed.url : msg.content.startsWith("/api/files/") ? msg.content : null;
    if (!url) return NextResponse.json({ error: "Не удалось изменить вложение" }, { status: 400 });
    content = JSON.stringify({
      ...(parsed as Record<string, unknown>),
      url,
      caption: newText,
    });
  } else if (msg.type !== "text") {
    return NextResponse.json({ error: "Это сообщение нельзя редактировать" }, { status: 400 });
  }

  if (!content) return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 });

  const [updated] = await db
    .update(messages)
    .set({ content, editedAt: new Date() })
    .where(eq(messages.id, id))
    .returning();

  return NextResponse.json({
    message: {
      id: updated.id,
      content: updated.content,
      editedAt: updated.editedAt ? new Date(updated.editedAt).toISOString() : null,
    },
  });
});

/** DELETE /api/messages/[id] — удалить своё сообщение (или менеджеру группы). */
export const DELETE = withApi<{ id: string }>("messages:delete", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const msg = rows[0];
  if (!msg) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membership = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  const my = membership[0];
  if (!my) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const isManager = my.role === "owner" || my.role === "admin";
  if (msg.senderId !== me.id && !isManager)
    return NextResponse.json({ error: "Нет прав на удаление" }, { status: 403 });

  await db
    .update(messages)
    .set({ deletedAt: new Date(), content: "" })
    .where(eq(messages.id, id));

  return NextResponse.json({ ok: true });
});
