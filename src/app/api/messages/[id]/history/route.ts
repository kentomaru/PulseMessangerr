import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messageEdits, messages } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * GET /api/messages/[id]/history — история правок сообщения
 * (старые версии текста, от новых к старым).
 */
export const GET = withApi<{ id: string }>("messages:history", async ({ params, me }) => {
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

  const versions = await db
    .select()
    .from(messageEdits)
    .where(eq(messageEdits.messageId, id))
    .orderBy(desc(messageEdits.createdAt));

  return NextResponse.json({
    current: msg.content,
    versions: versions.map((v) => ({
      content: v.content,
      createdAt: new Date(v.createdAt).toISOString(),
    })),
  });
});
