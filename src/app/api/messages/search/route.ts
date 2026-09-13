import { NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages } from "@/db/schema";
import { withApi } from "@/lib/api-helpers";

/**
 * Глобальный поиск по сообщениям во всех моих чатах (как в Telegram).
 * GET /api/messages/search?q=...
 */
export const GET = withApi("messages:search", async ({ req, me }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // мои диалоги
  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));
  const convIds = [...new Set(myConvs.map((c) => c.conversationId))];
  if (convIds.length === 0) return NextResponse.json({ results: [] });

  const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
  const rows = await db
    .select({
      message: messages,
      conv: conversations,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        inArray(messages.conversationId, convIds),
        isNull(messages.deletedAt),
        ilike(messages.content, pattern),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(25);

  const results = rows.map(({ message, conv }) => ({
    id: message.id,
    conversationId: message.conversationId,
    conversationName: conv.name,
    conversationKind: conv.kind,
    snippet: message.content.slice(0, 160),
    createdAt: new Date(message.createdAt).toISOString(),
  }));

  return NextResponse.json({ results });
});
