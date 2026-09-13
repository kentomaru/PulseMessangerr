import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationBans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isManager, requireMember } from "@/lib/conversations";

/**
 * DELETE /api/conversations/[id]/bans/[userId] — снять бан (только админам).
 */
export const DELETE = withApi<{ id: string; userId: string }>(
  "conversations:bans:remove",
  async ({ params, me, log }) => {
    const { id, userId } = params;
    if (!isUuid(id) || !isUuid(userId))
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    const access = await requireMember(id, me.id);
    if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (!isManager(access.membership.role))
      return NextResponse.json({ error: "Снимать бан могут только админы" }, { status: 403 });

    await db
      .delete(conversationBans)
      .where(and(eq(conversationBans.conversationId, id), eq(conversationBans.userId, userId)));

    log.info("Бан снят", { conversationId: id, userId });
    return NextResponse.json({ ok: true });
  },
);
