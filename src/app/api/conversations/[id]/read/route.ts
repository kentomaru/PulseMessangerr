import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * POST /api/conversations/[id]/read — отметить чат прочитанным.
 * С телом { unread: true } — наоборот, пометить непрочитанным
 * (точка прочтения ставится прямо перед последним сообщением).
 */
export const POST = withApi<{ id: string }>("conversations:read", async ({ params, me, req }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  let readAt = new Date();

  if (body.unread === true) {
    const [last] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.conversationId, id), isNull(messages.deletedAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    readAt = last
      ? new Date(new Date(last.createdAt).getTime() - 1000)
      : new Date(Date.now() - 60_000);
  }

  await db
    .update(conversationMembers)
    .set({ lastReadAt: readAt })
    .where(
      and(
        eq(conversationMembers.conversationId, id),
        eq(conversationMembers.userId, me.id),
      ),
    );
  return NextResponse.json({ ok: true });
});