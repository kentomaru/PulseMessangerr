import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messageEdits, messages, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";

/**
 * GET /api/messages/[id] — «кто прочитал»: участники, у которых
 * lastReadAt не раньше времени сообщения, считаются прочитавшими.
 */
export const GET = withApi<{ id: string }>("messages:reads", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const myMembership = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, msg.conversationId), eq(conversationMembers.userId, me.id)))
    .limit(1);
  if (myMembership.length === 0)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const rows = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, msg.conversationId));

  const sentAt = new Date(msg.createdAt).getTime();
  const readers = rows
    .filter((r) => r.member.userId !== me.id)
    .map((r) => ({
      user: publicUser(r.user),
      read: !!r.member.lastReadAt && new Date(r.member.lastReadAt).getTime() >= sentAt,
    }));

  return NextResponse.json({
    message: {
      id: msg.id,
      conversationId: msg.conversationId,
      createdAt: new Date(msg.createdAt).toISOString(),
    },
    readers,
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

  // Голосование в опросе: доступен любому участнику чата, не только автору.
  if (typeof body.pollVote === "number") {
    const pollMembership = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, msg.conversationId),
          eq(conversationMembers.userId, me.id),
        ),
      )
      .limit(1);
    if (pollMembership.length === 0)
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    let payload: { poll?: { q: string; opts: { t: string; v: string[] }[] } } = {};
    try {
      payload = JSON.parse(msg.content);
    } catch {
      payload = {};
    }
    if (!payload.poll || !Array.isArray(payload.poll.opts))
      return NextResponse.json({ error: "Это не опрос" }, { status: 422 });
    const idx = body.pollVote;
    if (!Number.isInteger(idx) || idx < 0 || idx >= payload.poll.opts.length)
      return NextResponse.json({ error: "Нет такого варианта" }, { status: 422 });

    // Один голос на пользователя: снять со всех вариантов, поставить на выбранный
    // (повторный клик по выбранному снимает голос).
    const already = payload.poll.opts[idx].v.includes(me.id);
    payload.poll.opts.forEach((o) => {
      o.v = o.v.filter((u) => u !== me.id);
    });
    if (!already) payload.poll.opts[idx].v.push(me.id);

    await db
      .update(messages)
      .set({ content: JSON.stringify(payload) })
      .where(eq(messages.id, id));
    return NextResponse.json({ ok: true, content: payload });
  }

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

  // История правок: сохраняем предыдущую версию (если текст реально менялся).
  if (msg.content !== content) {
    await db.insert(messageEdits).values({ messageId: id, content: msg.content });
    // не копим бесконечно: оставляем последние 10 версий
    const versions = await db
      .select({ id: messageEdits.id })
      .from(messageEdits)
      .where(eq(messageEdits.messageId, id))
      .orderBy(desc(messageEdits.createdAt));
    if (versions.length > 10) {
      const extra = versions.slice(10).map((v) => v.id);
      await db.delete(messageEdits).where(inArray(messageEdits.id, extra));
    }
  }

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
