import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages, users } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";

/** GET /api/messages/:id/readers — кто из участников уже прочитал сообщение. */
export const GET = withApi<{ id: string }>("messages:readers", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg || msg.deletedAt) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const [mine] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, msg.conversationId), eq(conversationMembers.userId, me.id)))
    .limit(1);
  if (!mine) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const rows = await db
    .select({ user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        gte(conversationMembers.lastReadAt, msg.createdAt),
      ),
    );
  const readers = rows
    .map((r) => r.user)
    .filter((u) => u.id !== msg.senderId)
    .map((u) => publicUser(u));
  return NextResponse.json({ readers });
});
