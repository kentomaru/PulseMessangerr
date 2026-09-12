import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messages } from "@/db/schema";
import { and, eq, isNull, ne } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isManager, normalizeKind } from "@/lib/conversations";

/**
 * DELETE /api/messages/[id] — мягкое удаление сообщения.
 * Своё сообщение может удалить любой; в группах и каналах чужое — владелец/админ.
 */
export const DELETE = withApi<{ id: string }>("messages:delete", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
    .limit(1);
  const message = rows[0];
  if (!message) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membership = await db
    .select({ m: conversationMembers, c: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.conversationId, message.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!membership[0]) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const manager =
    normalizeKind(membership[0].c.kind) !== "direct" && isManager(membership[0].m.role);
  if (message.senderId !== me.id && !manager)
    return NextResponse.json({ error: "Можно удалять только свои сообщения" }, { status: 403 });

  const [updated] = await db
    .update(messages)
    .set({ deletedAt: new Date(), content: "" })
    .where(eq(messages.id, id))
    .returning();

  // Ответы на удалённое сообщение больше не имеют смысла — снимаем ссылку
  await db
    .update(messages)
    .set({ replyToId: null })
    .where(and(eq(messages.replyToId, id), isNull(messages.deletedAt)))
    .catch(() => {});

  log.info("Сообщение удалено", {
    messageId: id,
    conversationId: updated.conversationId,
    byModerator: String(message.senderId !== me.id),
  });

  return NextResponse.json({ message: updated });
});

void ne;
