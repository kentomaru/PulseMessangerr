import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages, pollVotes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * POST /api/messages/[id]/vote — голос в опросе: { option: number, multi?: boolean }.
 * Голоса хранятся на сервере — все участники видят одинаковые результаты.
 * В обычном опросе голос заменяется, в мульти-опросе вариант добавляется/снимается.
 */
export const POST = withApi<{ id: string }>("messages:vote", async ({ req, params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const option = Number(body.option);
  const multi = body.multi === true;

  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg || msg.deletedAt || !String(msg.content ?? "").startsWith("poll:"))
    return NextResponse.json({ error: "Опрос не найден" }, { status: 404 });

  let optsLen = 10;
  try {
    const p = JSON.parse(String(msg.content).slice(5)) as { opts?: unknown[] };
    if (Array.isArray(p.opts)) optsLen = Math.min(10, Math.max(2, p.opts.length));
  } catch {
    /* не распарсилось */
  }
  if (!Number.isInteger(option) || option < 0 || option >= optsLen)
    return NextResponse.json({ error: "Нет такого варианта" }, { status: 400 });

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
  if (membership.length === 0) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  if (multi) {
    const existing = await db
      .select({ id: pollVotes.id })
      .from(pollVotes)
      .where(
        and(
          eq(pollVotes.messageId, id),
          eq(pollVotes.userId, me.id),
          eq(pollVotes.option, option),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await db.delete(pollVotes).where(eq(pollVotes.id, existing[0].id));
    } else {
      await db.insert(pollVotes).values({ messageId: id, userId: me.id, option });
    }
  } else {
    await db
      .delete(pollVotes)
      .where(and(eq(pollVotes.messageId, id), eq(pollVotes.userId, me.id)));
    await db.insert(pollVotes).values({ messageId: id, userId: me.id, option });
  }

  const rows = await db
    .select({ option: pollVotes.option, userId: pollVotes.userId })
    .from(pollVotes)
    .where(eq(pollVotes.messageId, id));
  const counts = new Array(optsLen).fill(0) as number[];
  const myVotes: number[] = [];
  for (const r of rows) {
    if (r.option >= 0 && r.option < optsLen) counts[r.option] += 1;
    if (r.userId === me.id) myVotes.push(r.option);
  }
  return NextResponse.json({ counts, myVotes: myVotes.sort((a, b) => a - b) });
});
