import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, calls } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * POST /api/calls/[id]/invite — получить ссылку-приглашение в звонок.
 * Ссылку можно кинуть кому угодно: открывший её сразу попадёт в комнату.
 */
export const POST = withApi<{ id: string }>("calls:invite-link", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  const rows = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  const call = rows[0];
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
  if (call.status !== "live" && call.status !== "ringing")
    return NextResponse.json({ error: "Звонок уже завершён" }, { status: 409 });

  const mine = await db
    .select()
    .from(callParticipants)
    .where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, me.id)))
    .limit(1);
  if (!mine[0]) return NextResponse.json({ error: "Вы не в этом звонке" }, { status: 403 });

  return NextResponse.json({
    token: call.joinToken,
    url: `${process.env.APP_URL ?? ""}/#join=${call.joinToken}`,
  });
});
