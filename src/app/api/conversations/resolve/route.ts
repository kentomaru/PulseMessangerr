import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations } from "@/db/schema";
import { withApi } from "@/lib/api-helpers";

/**
 * GET /api/conversations/resolve?username=name — найти чат/канал по @юзернейму.
 * Публичные отдаём всем, приватные — только участникам.
 */
export const GET = withApi("conversations:resolve", async ({ req, me }) => {
  const url = new URL(req.url);
  const name = (url.searchParams.get("username") ?? "").toLowerCase();
  if (!/^[a-z0-9_]{4,20}$/.test(name))
    return NextResponse.json({ conversation: null });

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.inviteToken, name))
    .limit(1);
  if (!conv || conv.kind === "direct")
    return NextResponse.json({ conversation: null });

  if (conv.isPrivate) {
    const [m] = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conv.id),
          eq(conversationMembers.userId, me.id),
        ),
      )
      .limit(1);
    if (!m) return NextResponse.json({ conversation: null });
  }

  return NextResponse.json({
    conversation: { id: conv.id, kind: conv.kind, name: conv.name, username: name },
  });
});
