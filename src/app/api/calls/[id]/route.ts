import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { expireIfStale, getCallCaller, insertCallLog, serializeCall } from "@/lib/calls";

/**
 * GET /api/calls/[id] — состояние звонка (обе стороны опрашивают раз в ~1 с):
 * статус, SDP-ответ и ICE-кандидаты второй стороны.
 *
 * POST /api/calls/[id] — действия:
 *   { action: "answer", answerSdp }  — принять (только вызываемый)
 *   { action: "decline" }            — отклонить (только вызываемый)
 *   { action: "hangup" }             — завершить (любая сторона)
 *   { action: "ice", candidate }     — добавить свой ICE-кандидат
 */
export const GET = withApi<{ id: string }>("calls:get", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
  const rows = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  let call = rows[0];
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
  if (call.callerId !== me.id && call.calleeId !== me.id)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  call = await expireIfStale(call);
  const caller = await getCallCaller(call);
  return NextResponse.json({ call: serializeCall(call, caller) });
});

export const POST = withApi<{ id: string }>("calls:action", async ({ req, params, me, log }) => {
  const { id } = params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const rows = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  const call = rows[0];
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });
  if (call.callerId !== me.id && call.calleeId !== me.id)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const isCaller = call.callerId === me.id;

  switch (action) {
    case "answer": {
      if (isCaller) return NextResponse.json({ error: "Ответить может только вызываемый" }, { status: 400 });
      if (call.status !== "ringing")
        return NextResponse.json({ error: "Звонок уже не звонит" }, { status: 409 });
      const answerSdp = String(body.answerSdp ?? "");
      if (!answerSdp) return NextResponse.json({ error: "answerSdp обязателен" }, { status: 400 });

      const [updated] = await db
        .update(calls)
        .set({ status: "active", answeredAt: new Date(), answerSdp })
        .where(eq(calls.id, id))
        .returning();
      log.info("Звонок принят", { callId: id });
      return NextResponse.json({ call: serializeCall(updated) });
    }

    case "decline": {
      if (isCaller) return NextResponse.json({ error: "Отклонить может только вызываемый" }, { status: 400 });
      if (call.status !== "ringing")
        return NextResponse.json({ error: "Звонок уже не звонит" }, { status: 409 });

      const [updated] = await db
        .update(calls)
        .set({ status: "declined", endedAt: new Date() })
        .where(eq(calls.id, id))
        .returning();
      await insertCallLog(call, "declined", 0);
      log.info("Звонок отклонён", { callId: id });
      return NextResponse.json({ call: serializeCall(updated) });
    }

    case "hangup": {
      if (call.status !== "ringing" && call.status !== "active")
        return NextResponse.json({ error: "Звонок уже завершён" }, { status: 409 });

      const durationSec =
        call.answeredAt && call.status === "active"
          ? Math.max(0, Math.round((Date.now() - new Date(call.answeredAt).getTime()) / 1000))
          : 0;
      // Если звонящий сбросил, пока гудело — «отменённый», иначе «завершённый»
      const logStatus = call.status === "ringing" ? "cancelled" : "ended";

      const [updated] = await db
        .update(calls)
        .set({ status: "ended", endedAt: new Date() })
        .where(eq(calls.id, id))
        .returning();
      await insertCallLog(call, logStatus, durationSec);
      log.info("Звонок завершён", { callId: id, durationSec: String(durationSec), reason: logStatus });
      return NextResponse.json({ call: serializeCall(updated) });
    }

    case "ice": {
      const candidate = body.candidate;
      if (!candidate || typeof candidate !== "object")
        return NextResponse.json({ error: "candidate обязателен" }, { status: 400 });

      const column = isCaller ? calls.callerIce : calls.calleeIce;
      await db
        .update(calls)
        .set({
          [isCaller ? "callerIce" : "calleeIce"]: sql`${column} || ${JSON.stringify([candidate])}::jsonb`,
        })
        .where(eq(calls.id, id));
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
});
