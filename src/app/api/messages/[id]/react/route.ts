import { db } from "@/db";
import { messages, reactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { assertMembership, getMessageById, getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const messageId = Number(id);
  const payload = (await request.json().catch(() => ({}))) as { emoji?: string };
  const emoji = (payload.emoji ?? "").slice(0, 16);
  if (!emoji) return Response.json({ error: "empty" }, { status: 400 });

  const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message) return Response.json({ error: "not_found" }, { status: 404 });
  if (!(await assertMembership(message.chatId, me.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (message.deletedForAllAt) return Response.json({ error: "deleted" }, { status: 400 });

  const existing = await db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, me.id),
        eq(reactions.emoji, emoji),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, me.id),
          eq(reactions.emoji, emoji),
        ),
      );
  } else {
    await db.insert(reactions).values({ messageId, userId: me.id, emoji });
  }

  await db.update(messages).set({ updatedAt: new Date() }).where(eq(messages.id, messageId));

  const hydrated = await getMessageById(messageId);
  return Response.json({ message: hydrated });
}
