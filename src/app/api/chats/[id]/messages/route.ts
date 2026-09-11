import { db } from "@/db";
import { attachments, chatMembers, files, messages, typingEvents } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  assertMembership,
  getBlockStatus,
  getMessageById,
  getSettings,
  loadMessages,
  loadTyping,
  settingsToPayload,
  touchPresence,
  getSessionUser,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const chatId = Number(id);
  if (!(await assertMembership(chatId, me.id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  await touchPresence(me.id);

  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? 0);
  const since = url.searchParams.get("since");
  const limit = Number(url.searchParams.get("limit") ?? 200);
  const { messages: list, updates } = await loadMessages(chatId, me.id, {
    after: Number.isFinite(after) && after > 0 ? after : undefined,
    since: since ?? undefined,
    limit: Number.isFinite(limit) ? Math.min(limit, 300) : 200,
  });
  const typing = await loadTyping(chatId, me.id);

  return Response.json({
    messages: list,
    updates,
    typing: typing.map((t) => t.name),
    serverTime: new Date().toISOString(),
  });
}

export async function POST(request: Request, context: Ctx) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const chatId = Number(id);
  if (!(await assertMembership(chatId, me.id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    body?: string;
    replyToId?: number | null;
    attachments?: { fileId: number }[];
  };

  const body = (payload.body ?? "").slice(0, 4000);
  const fileIds = (payload.attachments ?? []).map((a) => Number(a.fileId)).filter((n) => Number.isFinite(n));
  if (!body.trim() && fileIds.length === 0) {
    return Response.json({ error: "empty" }, { status: 400 });
  }

  // block check for direct chats
  const members = await db
    .select({ userId: chatMembers.userId })
    .from(chatMembers)
    .where(eq(chatMembers.chatId, chatId));
  const others = members.filter((m) => m.userId !== me.id).map((m) => m.userId);
  for (const other of others) {
    const status = await getBlockStatus(me.id, other);
    if (status.blocked || status.blockedBy) {
      return Response.json({ error: "blocked" }, { status: 403 });
    }
  }

  const ins = await db
    .insert(messages)
    .values({
      chatId,
      senderId: me.id,
      body,
      replyToId: payload.replyToId ? Number(payload.replyToId) : null,
    })
    .returning();
  const message = ins[0];

  if (fileIds.length > 0) {
    const valid = await db
      .select({ id: files.id })
      .from(files)
      .where(inArray(files.id, fileIds));
    if (valid.length > 0) {
      await db
        .insert(attachments)
        .values(valid.map((f) => ({ messageId: message.id, fileId: f.id })));
    }
  }

  await db
    .update(chatMembers)
    .set({ lastReadMessageId: message.id })
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)));
  await db
    .delete(typingEvents)
    .where(and(eq(typingEvents.chatId, chatId), eq(typingEvents.userId, me.id)));
  await touchPresence(me.id);

  const hydrated = await getMessageById(message.id);
  const settings = settingsToPayload(await getSettings(me.id));
  return Response.json({ message: hydrated, settings });
}
