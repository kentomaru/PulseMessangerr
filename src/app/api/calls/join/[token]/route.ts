import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { ensureMember, normalizeKind, requireMember } from "@/lib/conversations";
import { buildCallState, joinRoom, sweepStaleCalls } from "@/lib/calls";

/**
 * POST /api/calls/join/[token] — войти в звонок по ссылке-приглашению.
 * Ссылка вида `…/#join=<token>` работает даже у того, кто не состоит в чате:
 * он попадает в комнату как гость (в группах/каналах заодно становится участником).
 */
export const POST = withApi<{ token: string }>("calls:join-by-token", async ({ params, me, log }) => {
  const { token } = params;
  if (!token || token.length > 64)
    return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });

  const rows = await db.select().from(calls).where(eq(calls.joinToken, token)).limit(1);
  const call = rows[0];
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  await sweepStaleCalls([call.conversationId]);
  const fresh = await db.select().from(calls).where(eq(calls.id, call.id)).limit(1).then((r) => r[0]);
  if (!fresh || fresh.status === "ended" || fresh.status === "missed" || fresh.status === "declined") {
    return NextResponse.json({ error: "Звонок уже завершён" }, { status: 410 });
  }

  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, fresh.conversationId))
    .limit(1);
  const conv = convRows[0] ?? null;
  const kind = normalizeKind(conv?.kind ?? "direct");

  // В приватный диалог по ссылке заходят только как гость звонка,
  // в публичную группу/канал — сразу становимся участником.
  const guest = !(await requireMember(fresh.conversationId, me.id));
  const updated = await joinRoom(fresh, me.id, { guest });
  if (guest && kind !== "direct" && conv && !conv.isPrivate) {
    await ensureMember(conv.id, me.id, "member");
  }

  log.info("Вход в звонок по ссылке", { callId: updated.id, userId: me.id, guest: String(guest) });
  return NextResponse.json({
    call: await buildCallState(updated, me.id, { deliverSignals: true }),
  });
});
