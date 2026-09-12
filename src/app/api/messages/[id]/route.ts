import { db } from "@/db";
import { hiddenMessages, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { assertMembership, getMessageById, getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const messageId = Number(id);
  const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message) return Response.json({ error: "not_found" }, { status: 404 });
  if (message.senderId !== me.id) return Response.json({ error: "forbidden" }, { status: 403 });
  const payload = (await request.json().catch(() => ({}))) as { body?: string };
  const body = (payload.body ?? "").slice(0, 4000);
  if (!body.trim()) return Response.json({ error: "empty" }, { status: 400 });
  await db
    .update(messages)
    .set({ body, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(messages.id, messageId));
  const hydrated = await getMessageById(messageId);
  return Response.json({ message: hydrated });
}

export async function DELETE(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const messageId = Number(id);
  const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message) return Response.json({ error: "not_found" }, { status: 404 });
  if (!(await assertMembership(message.chatId, me.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "me";

  if (scope === "all") {
    if (message.senderId !== me.id) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    await db
      .update(messages)
      .set({ deletedForAllAt: new Date(), body: "", updatedAt: new Date() })
      .where(eq(messages.id, messageId));
    return Response.json({ ok: true, scope: "all" });
  }

  await db
    .insert(hiddenMessages)
    .values({ messageId, userId: me.id })
    .onConflictDoNothing();
  return Response.json({ ok: true, scope: "me" });
}
