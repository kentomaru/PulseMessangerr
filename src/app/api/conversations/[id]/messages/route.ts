import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isManager, normalizeKind, requireMember } from "@/lib/conversations";

/**
 * DELETE /api/conversations/[id]/messages — «Очистить историю».
 * В группах/каналах доступно только владельцу и админам; в личных чатах — обоим.
 * Сообщения помечаются удалёнными (мягкое удаление), закреплённые снимаются.
 */
export const DELETE = withApi<{ id: string }>(
  "conversations:messages:clear",
  async ({ params, me, log }) => {
    const { id } = params;
    if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

    const access = await requireMember(id, me.id);
    if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const kind = normalizeKind(access.conversation.kind);
    if (kind !== "direct" && !isManager(access.membership.role))
      return NextResponse.json(
        { error: "Очищать историю могут только админы" },
        { status: 403 },
      );

    const now = new Date();
    const updated = await db
      .update(messages)
      .set({ deletedAt: now, pinnedAt: null })
      .where(and(eq(messages.conversationId, id), isNull(messages.deletedAt)))
      .returning({ id: messages.id });

    log.info("История чата очищена", { conversationId: id, count: updated.length });
    return NextResponse.json({ ok: true, cleared: updated.length });
  },
);
