import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * POST /api/messages/[id]/pin — закрепить/открепить сообщение (toggle).
 *
 * Права: в личном чате — любой участник; в группе/канале — владельцы, админы
 * или автор сообщения (закрепляет своё).
 */
export const POST = withApi<{ id: string }>("messages:pin", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const msg = rows[0];
  if (!msg || msg.deletedAt)
    return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membershipRows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  const my = membershipRows[0];
  if (!my) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const convRows = await db
    .select({ kind: conversations.kind })
    .from(conversations)
    .where(eq(conversations.id, msg.conversationId))
    .limit(1);
  const isDirect = convRows[0]?.kind === "direct";

  const isManager = my.role === "owner" || my.role === "admin";
  if (!isDirect && !isManager && msg.senderId !== me.id)
    return NextResponse.json(
      { error: "Закреплять могут администраторы или автор сообщения" },
      { status: 403 },
    );

  const nextPinned = !msg.pinnedAt;
  await db
    .update(messages)
    .set({ pinnedAt: nextPinned ? new Date() : null })
    .where(eq(messages.id, id));

  return NextResponse.json({ pinned: nextPinned });
});
