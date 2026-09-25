import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messages } from "@/db/schema";
import { and, eq, gt, isNull, lte, ne, sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { normalizeKind } from "@/lib/conversations";

export const POST = withApi<{ id: string }>("conversations:read", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  // Запоминаю, до куда я читал раньше — чтобы засчитать просмотры только новых постов
  const [membership] = await db
    .select({ lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)))
    .limit(1);
  const prevRead = membership?.lastReadAt ?? new Date(0);
  const now = new Date();

  await db
    .update(conversationMembers)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, me.id),
      ),
    );

  // Канал: как в ТГ — каждый пост считает просмотры («глазик»).
  // Засчитываю только те посты, которые я реально дочитал впервые (между прошлой и новой отметкой).
  try {
    const [conv] = await db
      .select({ kind: conversations.kind })
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (conv && normalizeKind(conv.kind) === "channel") {
      await db
        .update(messages)
        .set({ views: sql`${messages.views} + 1` })
        .where(
          and(
            eq(messages.conversationId, id),
            ne(messages.senderId, me.id),
            isNull(messages.replyToId),
            isNull(messages.deletedAt),
            gt(messages.createdAt, prevRead),
            lte(messages.createdAt, now),
          ),
        );
    }
  } catch {
    /* просмотры — не критично */
  }

  return NextResponse.json({ ok: true });
});
