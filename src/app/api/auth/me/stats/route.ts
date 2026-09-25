import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messageReactions, messages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";

/** GET /api/auth/me/stats — личная статистика: чаты, сообщения, реакции, стаж. */
export const GET = withApi("me:stats", async ({ me }) => {
  const [chats] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));
  const [sent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.senderId, me.id));
  const [reacts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messageReactions)
    .innerJoin(messages, eq(messages.id, messageReactions.messageId))
    .where(eq(messages.senderId, me.id));
  const days = Math.max(1, Math.round((Date.now() - new Date(me.createdAt).getTime()) / 86_400_000));
  return NextResponse.json({
    stats: {
      days,
      chats: chats?.n ?? 0,
      sent: sent?.n ?? 0,
      reactions: reacts?.n ?? 0,
      premium: !!me.premium,
    },
  });
});
