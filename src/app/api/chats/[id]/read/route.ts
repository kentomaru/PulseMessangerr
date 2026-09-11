import { db } from "@/db";
import { chatMembers, messages, typingEvents } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { assertMembership, getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const chatId = Number(id);
  if (!(await assertMembership(chatId, me.id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const payload = (await request.json().catch(() => ({}))) as { typing?: boolean };

  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        sql`not exists (select 1 from hidden_messages hm where hm.message_id = ${messages.id} and hm.user_id = ${me.id})`,
      ),
    )
    .orderBy(desc(messages.id))
    .limit(1);
  const lastId = rows[0]?.id ?? 0;
  await db
    .update(chatMembers)
    .set({ lastReadMessageId: lastId })
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)));

  if (payload.typing) {
    await db
      .insert(typingEvents)
      .values({ chatId, userId: me.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [typingEvents.chatId, typingEvents.userId],
        set: { updatedAt: new Date() },
      });
  } else {
    await db
      .delete(typingEvents)
      .where(and(eq(typingEvents.chatId, chatId), eq(typingEvents.userId, me.id)));
  }

  return Response.json({ ok: true, lastReadMessageId: lastId });
}
