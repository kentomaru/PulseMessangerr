import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, calls, conversationMembers, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { normalizeKind, requireMember } from "@/lib/conversations";
import {
  buildCallState,
  findActiveCall,
  joinRoom,
  newJoinToken,
  sweepStaleCalls,
} from "@/lib/calls";

/**
 * POST /api/calls — начать звонок в диалоге { conversationId, media }.
 *
 * Личный чат: звонок создаётся в статусе «ringing» (собеседнику звонит телефон),
 * когда он принимает — комната становится «live».
 * Группа/канал: сразу создаётся «живая» комната, к которой может присоединиться
 * любой участник (как голосовой канал в Discord).
 *
 * Если в диалоге уже есть живой звонок — просто подключаемся к нему.
 */
export const POST = withApi("calls:start", async ({ req, me, log }) => {
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const media = body.media === "video" ? "video" : "audio";
  if (!conversationId || !isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  // Медиастатус создателя/входящего (камера/микрофон) — раньше флаг videoOn
  // здесь НЕ сохранялся: у автора видеозвонка плитка камеры не показывалась,
  // хотя дорожка видео уже шла собеседникам («изображение не показывается»).
  const mediaPatch: Partial<typeof callParticipants.$inferInsert> = {};
  if (typeof body.videoOn === "boolean") mediaPatch.videoOn = body.videoOn;
  if (typeof body.muted === "boolean") mediaPatch.muted = body.muted;

  const access = await requireMember(conversationId, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const kind = normalizeKind(access.conversation.kind);

  // Уже живой звонок? Тогда просто входим в комнату.
  await sweepStaleCalls([conversationId]);
  const existing = await findActiveCall(conversationId);
  if (existing) {
    let updated = await joinRoom(existing, me.id);
    if (Object.keys(mediaPatch).length > 0) {
      await db
        .update(callParticipants)
        .set(mediaPatch)
        .where(and(eq(callParticipants.callId, existing.id), eq(callParticipants.userId, me.id)));
      const fresh = await db.select().from(calls).where(eq(calls.id, existing.id)).limit(1);
      if (fresh[0]) updated = fresh[0];
    }
    log.info("Подключение к существующему звонку", { callId: updated.id, userId: me.id });
    return NextResponse.json({
      call: await buildCallState(updated, me.id),
      joinedExisting: true,
    });
  }

  // Личный чат: уважаем приватность собеседника
  if (kind === "direct") {
    const peerRows = await db
      .select({ user: users })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          ne(conversationMembers.userId, me.id),
        ),
      )
      .limit(1);
    const peer = peerRows[0]?.user;
    if (!peer) return NextResponse.json({ error: "Собеседник не найден" }, { status: 404 });
    if (!peer.allowCalls) {
      return NextResponse.json({ error: `${peer.displayName} запретил(а) звонки` }, { status: 403 });
    }
  }

  const [call] = await db
    .insert(calls)
    .values({
      conversationId,
      hostId: me.id,
      media,
      status: kind === "direct" ? "ringing" : "live",
      joinToken: newJoinToken(),
      participantCount: 1,
      answeredAt: kind === "direct" ? null : new Date(),
    })
    .returning();

  await joinRoom(call, me.id);
  // публикуем медиастатус создателя (videoOn/muted из тела запроса)
  if (Object.keys(mediaPatch).length > 0) {
    await db
      .update(callParticipants)
      .set(mediaPatch)
      .where(and(eq(callParticipants.callId, call.id), eq(callParticipants.userId, me.id)));
  }
  const fresh = await db.select().from(calls).where(eq(calls.id, call.id)).limit(1).then((r) => r[0]);

  log.info("Звонок начат", {
    callId: call.id,
    conversationId,
    kind,
    media,
    by: me.username,
  });
  return NextResponse.json({ call: await buildCallState(fresh ?? call, me.id) });
});
