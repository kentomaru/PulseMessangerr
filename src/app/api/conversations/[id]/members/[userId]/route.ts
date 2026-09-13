import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationBans, conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isManager, normalizeKind, requireMember } from "@/lib/conversations";

/**
 * DELETE /api/conversations/[id]/members/[userId] — исключить участника (кик + бан).
 * Доступно владельцу и админам; владельца исключить нельзя.
 * С флагом ?ban=0 только убирает из чата, без запрета на повторный вход.
 */
export const DELETE = withApi<{ id: string; userId: string }>(
  "conversations:members:remove",
  async ({ req, params, me, log }) => {
    const { id, userId } = params;
    if (!isUuid(id) || !isUuid(userId))
      return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    if (userId === me.id)
      return NextResponse.json({ error: "Нельзя исключить самого себя — выйдите из чата" }, { status: 400 });

    const access = await requireMember(id, me.id);
    if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const kind = normalizeKind(access.conversation.kind);
    if (kind === "direct")
      return NextResponse.json({ error: "В личном чате нельзя исключать" }, { status: 400 });
    if (!isManager(access.membership.role))
      return NextResponse.json({ error: "Исключать могут только админы" }, { status: 403 });
    if (access.conversation.ownerId === userId)
      return NextResponse.json({ error: "Владельца исключить нельзя" }, { status: 403 });

    const [target] = await db
      .select()
      .from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)))
      .limit(1);
    if (!target) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
    // Админ не может исключить другого админа — только владелец может.
    if (isManager(target.role) && access.membership.role !== "owner")
      return NextResponse.json({ error: "Админа может исключить только владелец" }, { status: 403 });

    await db
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));

    const noBan = req.nextUrl.searchParams.get("ban") === "0";
    if (!noBan) {
      await db
        .insert(conversationBans)
        .values({ conversationId: id, userId, bannedBy: me.id })
        .onConflictDoNothing();
    }

    log.info("Участник исключён", { conversationId: id, userId, ban: String(!noBan) });
    return NextResponse.json({ ok: true, banned: !noBan });
  },
);
