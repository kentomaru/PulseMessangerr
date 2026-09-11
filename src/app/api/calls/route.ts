import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversationMembers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { closeStaleCalls, getCallCaller, serializeCall } from "@/lib/calls";

/**
 * POST /api/calls — начать звонок.
 * Тело: { conversationId, media: "audio"|"video", offerSdp }.
 * Сервер сохраняет SDP-предложение звонящего; собеседник забирает его
 * через GET /api/calls/incoming и отвечает через POST /api/calls/[id].
 */
export const POST = withApi("calls:start", async ({ req, me, log }) => {
  const body = await req.json();
  const conversationId = String(body.conversationId ?? "");
  const media = body.media === "video" ? "video" : "audio";
  const offerSdp = String(body.offerSdp ?? "");
  if (!conversationId || !offerSdp)
    return NextResponse.json({ error: "conversationId и offerSdp обязательны" }, { status: 400 });
  if (!isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  // Я — участник чата?
  const myMembership = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!myMembership[0]) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  // Собеседник
  const peerRows = await db
    .select({ user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId));
  const peer = peerRows.map((r) => r.user).find((u) => u.id !== me.id);
  if (!peer) return NextResponse.json({ error: "Собеседник не найден" }, { status: 404 });

  // Приватность: звонки запрещены
  if (!peer.allowCalls) {
    return NextResponse.json(
      { error: `${peer.displayName} запретил(а) звонки` },
      { status: 403 },
    );
  }

  // Сначала закрываем повисшие звонки (ringing >40 с, active-зомби >4 ч),
  // потом проверяем, остался ли реально живой звонок в этом чате.
  const alive = await closeStaleCalls(conversationId);
  if (alive) {
    const aliveCaller = await getCallCaller(alive);
    log.info("Старт звонка отклонён: в чате уже есть звонок", {
      callId: alive.id,
      conversationId,
      status: alive.status,
      mine: String(alive.callerId === me.id),
    });
    // Отдаём тело звонка: клиент сам решит — отменить свой зависший
    // и позвонить заново, или показать чужой как входящий.
    return NextResponse.json(
      {
        error: alive.callerId === me.id ? "Ваш предыдущий звонок ещё активен" : "Звонок уже идёт",
        call: serializeCall(alive, aliveCaller),
      },
      { status: 409 },
    );
  }

  const [call] = await db
    .insert(calls)
    .values({
      conversationId,
      callerId: me.id,
      calleeId: peer.id,
      media,
      status: "ringing",
      offerSdp,
      callerIce: [],
      calleeIce: [],
    })
    .returning();

  log.info("Звонок начат", { callId: call.id, conversationId, media, from: me.username, to: peer.username });
  return NextResponse.json({ call: serializeCall(call, me) });
});
