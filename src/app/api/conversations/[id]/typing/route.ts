import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** Индикатор «печатает…»: собеседник видит это ~4 секунды. */
export const POST = withApi<{ id: string }>("conversations:typing", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  await db
    .update(conversationMembers)
    .set({ typingAt: new Date() })
    .where(
      and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)),
    );
  return NextResponse.json({ ok: true });
});
