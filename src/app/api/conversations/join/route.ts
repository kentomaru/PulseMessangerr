import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationBans, conversations } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { ensureMember, serializeConversation } from "@/lib/conversations";

/**
 * POST /api/conversations/join — вступить в группу/канал.
 *  { token }          — по ссылке-приглашению (работает и для приватных);
 *  { conversationId } — по id, если диалог публичный.
 */
export const POST = withApi("conversations:join", async ({ req, me, log }) => {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";

  let conv: typeof conversations.$inferSelect | null = null;

  if (token) {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.inviteToken, token))
      .limit(1);
    conv = rows[0] ?? null;
    if (!conv)
      return NextResponse.json({ error: "Ссылка-приглашение не найдена или устарела" }, { status: 404 });
  } else if (isUuid(conversationId)) {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    conv = rows[0] ?? null;
    if (!conv) return NextResponse.json({ error: "Диалог не найден" }, { status: 404 });
    if (conv.isPrivate && conv.kind !== "direct")
      return NextResponse.json(
        { error: "Это приватный диалог — нужно приглашение" },
        { status: 403 },
      );
  } else {
    return NextResponse.json({ error: "Нужен token или conversationId" }, { status: 400 });
  }

  if (conv.kind === "direct")
    return NextResponse.json({ error: "Это личный чат" }, { status: 400 });

  // Забаненные админами не могут вернуться по приглашению.
  const banned = await db
    .select({ userId: conversationBans.userId })
    .from(conversationBans)
    .where(and(eq(conversationBans.conversationId, conv.id), eq(conversationBans.userId, me.id)))
    .limit(1);
  if (banned.length > 0)
    return NextResponse.json({ error: "Вы исключены из этого чата" }, { status: 403 });

  await ensureMember(conv.id, me.id, "member");
  log.info("Пользователь вступил в диалог", {
    conversationId: conv.id,
    userId: me.id,
    byToken: String(!!token),
  });

  return NextResponse.json({ conversation: await serializeConversation(conv, me.id) });
});

void or;
