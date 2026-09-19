import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isManager, normalizeKind, requireMember } from "@/lib/conversations";

/**
 * POST /api/conversations/:id/clear — «Очистить историю».
 * Админ/владелец стирает всё; обычный участник — только свои сообщения.
 */
export const POST = withApi<{ id: string }>("conversations:clear", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const kind = normalizeKind(access.conversation.kind);

  if (kind === "direct" || isManager(access.membership.role)) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    return NextResponse.json({ ok: true });
  }
  await db
    .delete(messages)
    .where(and(eq(messages.conversationId, id), eq(messages.senderId, me.id)));
  return NextResponse.json({ ok: true });
});
