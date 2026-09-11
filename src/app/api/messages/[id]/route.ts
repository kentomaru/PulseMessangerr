import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** Удаление своего сообщения (мягкое: содержимое скрывается у обоих). */
export const DELETE = withApi<{ id: string }>("messages:delete", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), eq(messages.senderId, me.id), isNull(messages.deletedAt)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const [updated] = await db
    .update(messages)
    .set({ deletedAt: new Date(), content: "" })
    .where(eq(messages.id, id))
    .returning();
  log.info("Сообщение удалено", { messageId: id, conversationId: updated.conversationId });

  return NextResponse.json({ message: updated });
});
