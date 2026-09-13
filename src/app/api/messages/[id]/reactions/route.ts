import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messageReactions, messages, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";

/**
 * GET /api/messages/[id]/reactions — «кто отреагировал»:
 * список пользователей, сгруппированный по эмодзи.
 */
export const GET = withApi<{ id: string }>("messages:reactions", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg || msg.deletedAt)
    return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (membership.length === 0)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const rows = await db
    .select({ reaction: messageReactions, user: users })
    .from(messageReactions)
    .innerJoin(users, eq(users.id, messageReactions.userId))
    .where(eq(messageReactions.messageId, id));

  const byEmoji = new Map<string, ReturnType<typeof publicUser>[]>();
  for (const { reaction, user } of rows) {
    const list = byEmoji.get(reaction.emoji) ?? [];
    list.push(publicUser(user));
    byEmoji.set(reaction.emoji, list);
  }

  const reactions = [...byEmoji.entries()].map(([emoji, list]) => ({ emoji, users: list }));
  return NextResponse.json({ reactions });
});
