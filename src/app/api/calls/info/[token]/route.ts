import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, calls, conversations, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { normalizeKind } from "@/lib/conversations";
import { sweepStaleCalls } from "@/lib/calls";
import { publicUser } from "@/lib/auth";

/**
 * GET /api/calls/info/[token] — что за звонок по ссылке-приглашению.
 * Не требует участия в диалоге: по ссылке можно зайти и «с улицы».
 */
export const GET = withApi<{ token: string }>("calls:info-by-token", async ({ params }) => {
  const { token } = params;
  if (!token || token.length > 64)
    return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });

  const rows = await db.select().from(calls).where(eq(calls.joinToken, token)).limit(1);
  const call = rows[0];
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  await sweepStaleCalls([call.conversationId]);
  const fresh = await db
    .select()
    .from(calls)
    .where(eq(calls.id, call.id))
    .limit(1)
    .then((r) => r[0] ?? call);

  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, fresh.conversationId))
    .limit(1)
    .then((r) => r[0] ?? null);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(callParticipants)
    .where(and(eq(callParticipants.callId, fresh.id), sql`${callParticipants.leftAt} is null`));

  const host = await db
    .select()
    .from(users)
    .where(eq(users.id, fresh.hostId))
    .limit(1)
    .then((r) => r[0] ?? null);

  const kind = normalizeKind(conv?.kind ?? "direct");
  const title = kind === "direct" ? (host?.displayName ?? "Чат") : (conv?.name?.trim() || (kind === "channel" ? "Канал" : "Группа"));

  return NextResponse.json({
    call: {
      id: fresh.id,
      conversationId: fresh.conversationId,
      media: fresh.media === "video" ? "video" : "audio",
      status: fresh.status,
      title,
      kind,
      avatarUrl: conv?.avatarUrl ?? host?.avatarUrl ?? null,
      participants: Number(n ?? 0),
      host: host ? publicUser(host) : null,
      ended: fresh.status === "ended" || fresh.status === "missed" || fresh.status === "declined",
    },
  });
});
