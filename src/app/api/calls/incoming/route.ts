import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { endCall, listIncomingFor, sweepStaleCalls, RING_TIMEOUT_MS } from "@/lib/calls";

/**
 * GET /api/calls/incoming[?token=...] — звонки, в которые я могу войти,
 * но ещё не вошёл: активные комнаты в моих диалогах, личные приглашения
 * («добавить человека») и звонок по ссылке-приглашению из URL.
 * Клиент опрашивает роут раз в ~3 секунды.
 */
export const GET = withApi("calls:incoming", async ({ req, me }) => {
  const token = req.nextUrl.searchParams.get("token")?.trim() || null;

  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));
  // Заодно убираем «мёртвые» комнаты и просроченные дозвоны в моих диалогах
  await sweepStaleCalls(myConvs.map((c) => c.conversationId));

  if (token) {
    const rows = await db
      .select()
      .from(calls)
      .where(and(eq(calls.joinToken, token), eq(calls.status, "ringing")))
      .limit(1);
    const c = rows[0];
    if (c && Date.now() - new Date(c.startedAt).getTime() > RING_TIMEOUT_MS) {
      await endCall(c, "missed");
    }
  }

  const list = await listIncomingFor(me.id, token);
  return NextResponse.json({ calls: list });
});
