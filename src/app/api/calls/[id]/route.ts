import { NextResponse } from "next/server";
import { db } from "@/db";
import { callInvites, callParticipants, callSignals, calls, conversations } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { ensureMember, getMembership, isManager, normalizeKind } from "@/lib/conversations";
import {
  assertCanJoin,
  buildCallState,
  endCall,
  inviteToCall,
  joinRoom,
  leaveRoom,
  listParticipants,
} from "@/lib/calls";
import type { Call } from "@/db/schema";

async function loadCall(id: string): Promise<Call | null> {
  const rows = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Я участник комнаты? */
async function isParticipant(callId: string, userId: string) {
  const rows = await db
    .select()
    .from(callParticipants)
    .where(and(eq(callParticipants.callId, callId), eq(callParticipants.userId, userId)))
    .limit(1);
  return !!rows[0];
}

/**
 * GET /api/calls/[id] — состояние комнаты: участники, моя строка и
 * сигнальные сообщения (answer/ice), адресованные мне.
 * Опрос этого роута заодно считается «heartbeat» участника.
 */
export const GET = withApi<{ id: string }>("calls:get", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  const call = await loadCall(id);
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  const token = await isParticipant(id, me.id);
  if (!token) {
    // Не участник комнаты: даём посмотреть только если есть право войти
    const access = await assertCanJoin(call, me.id, null);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  } else {
    await db
      .update(callParticipants)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, me.id)));
  }

  return NextResponse.json({ call: await buildCallState(call, me.id, { deliverSignals: true }) });
});

/**
 * POST /api/calls/[id] — действия в комнате:
 *   { action: "join", token?, sdp?, videoOn? }  — войти (в т.ч. по ссылке)
 *   { action: "signal", to, kind, payload }     — offer/answer/ice конкретному участнику
 *   { action: "state", videoOn?, muted? }       — мой медиастатус
 *   { action: "leave" }                         — выйти из комнаты
 *   { action: "end" }                           — завершить звонок для всех
 *   { action: "decline" }                       — отклонить входящий в ЛС
 *   { action: "invite", userIds[] }             — позвать людей в звонок
 */
export const POST = withApi<{ id: string }>("calls:action", async ({ req, params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const call = await loadCall(id);
  if (!call) return NextResponse.json({ error: "Звонок не найден" }, { status: 404 });

  const ended = call.status === "ended" || call.status === "missed" || call.status === "declined";

  switch (action) {
    /* ── войти в комнату ── */
    case "join": {
      if (ended) return NextResponse.json({ error: "Звонок уже завершён" }, { status: 409 });
      const token = typeof body.token === "string" ? body.token : null;
      const access = await assertCanJoin(call, me.id, token);
      if (!access.ok)
        return NextResponse.json({ error: access.error }, { status: access.status });

      const sdp = typeof body.sdp === "string" && body.sdp.length > 0 ? body.sdp.slice(0, 20_000) : null;
      let updated = await joinRoom(call, me.id, { guest: access.guest, sdp });

      // Сразу публикуем медиастатус вошедшего (камера/микрофон/экран)
      const mediaPatch: Partial<typeof callParticipants.$inferInsert> = {};
      if (typeof body.videoOn === "boolean") mediaPatch.videoOn = body.videoOn;
      if (typeof body.muted === "boolean") mediaPatch.muted = body.muted;
      if (typeof body.screenOn === "boolean") mediaPatch.screenOn = body.screenOn;
      if (Object.keys(mediaPatch).length > 0) {
        const [row] = await db
          .update(callParticipants)
          .set(mediaPatch)
          .where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, me.id)))
          .returning();
        void row;
        const fresh = await loadCall(id);
        if (fresh) updated = fresh;
      }

      // Зашёл по ссылке в группу/канал — становимся участником диалога,
      // чтобы видеть чат и следующие звонки. В личных чатах остаёмся «гостем звонка».
      if (access.guest && access.reason === "token") {
        const convRows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, call.conversationId))
          .limit(1);
        const kind = normalizeKind(convRows[0]?.kind ?? "direct");
        if (kind !== "direct") await ensureMember(call.conversationId, me.id, "member");
      }

      log.info("Участник присоединился к звонку", {
        callId: id,
        userId: me.id,
        guest: String(access.guest),
        via: access.reason,
      });
      return NextResponse.json({ call: await buildCallState(updated, me.id, { deliverSignals: true }) });
    }

    /* ── сигнальное сообщение другому участнику ── */
    case "signal": {
      if (!(await isParticipant(id, me.id)))
        return NextResponse.json({ error: "Вы не в этом звонке" }, { status: 403 });
      const kind = String(body.kind ?? "");
      if (kind !== "offer" && kind !== "answer" && kind !== "ice")
        return NextResponse.json({ error: "Некорректный тип сигнала" }, { status: 400 });

      const payload = body.payload;
      if (!payload || typeof payload !== "object")
        return NextResponse.json({ error: "payload обязателен" }, { status: 400 });

      // получатели: один конкретный или все остальные участники
      const targets: string[] = [];
      if (typeof body.to === "string" && body.to.length > 0) {
        targets.push(body.to);
      } else {
        const parts = await listParticipants(id);
        for (const p of parts) if (p.userId !== me.id) targets.push(p.userId);
      }
      if (targets.length === 0) return NextResponse.json({ ok: true, delivered: 0 });

      const rows = await db
        .select({ userId: callParticipants.userId })
        .from(callParticipants)
        .where(
          and(eq(callParticipants.callId, id), inArray(callParticipants.userId, targets)),
        );
      const valid = rows.map((r) => r.userId);
      if (valid.length === 0) return NextResponse.json({ ok: true, delivered: 0 });

      const json = JSON.stringify(payload).slice(0, 30_000);
      await db.insert(callSignals).values(
        valid.map((toUserId) => ({
          callId: id,
          fromUserId: me.id,
          toUserId,
          kind,
          payload: JSON.parse(json),
        })),
      );

      await db
        .update(callParticipants)
        .set({ lastSeenAt: new Date() })
        .where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, me.id)));

      return NextResponse.json({ ok: true, delivered: valid.length });
    }

    /* ── мой медиастатус (камера/микрофон/демонстрация экрана) ── */
    case "state": {
      const patch: Partial<typeof callParticipants.$inferInsert> = { lastSeenAt: new Date() };
      if (typeof body.videoOn === "boolean") patch.videoOn = body.videoOn;
      if (typeof body.muted === "boolean") patch.muted = body.muted;
      if (typeof body.screenOn === "boolean") patch.screenOn = body.screenOn;
      const updated = await db
        .update(callParticipants)
        .set(patch)
        .where(and(eq(callParticipants.callId, id), eq(callParticipants.userId, me.id)))
        .returning();
      if (updated.length === 0)
        return NextResponse.json({ error: "Вы не в этом звонке" }, { status: 403 });
      return NextResponse.json({ ok: true });
    }

    /* ── пригласить людей в звонок ── */
    case "invite": {
      if (ended) return NextResponse.json({ error: "Звонок уже завершён" }, { status: 409 });
      if (!(await isParticipant(id, me.id)))
        return NextResponse.json({ error: "Вы не в этом звонке" }, { status: 403 });
      const ids = Array.isArray(body.userIds) ? body.userIds.map(String).filter(isUuid) : [];
      if (ids.length === 0)
        return NextResponse.json({ error: "Некого приглашать" }, { status: 400 });

      const invited: string[] = [];
      for (const userId of ids.slice(0, 25)) {
        if (await isParticipant(id, userId)) continue;
        const ok = await inviteToCall(call, userId, me.id);
        if (ok) invited.push(userId);
      }
      return NextResponse.json({ ok: true, invited });
    }

    /* ── выйти из комнаты ── */
    case "leave": {
      if (!(await isParticipant(id, me.id))) return NextResponse.json({ ok: true });
      const updated = await leaveRoom(call, me.id);
      log.info("Участник вышел из звонка", { callId: id, userId: me.id });
      return NextResponse.json({ ok: true, call: { status: updated.status } });
    }

    /* ── завершить звонок для всех ── */
    case "end": {
      const membership = await getMembership(call.conversationId, me.id);
      const hostOrManager =
        call.hostId === me.id || (membership ? isManager(membership.role) : false);
      if (!hostOrManager && !(await isParticipant(id, me.id)))
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      const updated = await endCall(call, "host-ended");
      return NextResponse.json({ ok: true, call: { status: updated.status } });
    }

    /* ── отклонить входящий звонок в личном чате ── */
    case "decline": {
      if (call.status !== "ringing")
        return NextResponse.json({ error: "Звонок уже не звонит" }, { status: 409 });
      await db
        .delete(callInvites)
        .where(and(eq(callInvites.callId, id), eq(callInvites.userId, me.id)))
        .catch(() => {});
      const updated = await endCall(call, "declined");
      return NextResponse.json({ ok: true, call: { status: updated.status } });
    }

    default:
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
});
