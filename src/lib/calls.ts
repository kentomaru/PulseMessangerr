/**
 * Серверные помощники для звонков (WebRTC-сигналинг через БД).
 *
 * Модель: звонок = «комната» на диалог. В комнате может быть сколько угодно
 * участников, медиа идёт напрямую между браузерами (mesh), а сервер хранит
 * только сигнальные данные:
 *   — call_participants.sdp   — оффер участника для всех остальных;
 *   — call_signals            — очередь answer/ice «от кого → кому».
 * Клиентская логика — в src/lib/useCallController.ts (этот файл — только сервер).
 */
import { db } from "@/db";
import {
  callInvites,
  callParticipants,
  calls,
  callSignals,
  conversations,
  conversationMembers,
  messages,
  users,
  type Call,
  type CallParticipant,
  type User,
} from "@/db/schema";
import { and, asc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { getMembership, normalizeKind } from "@/lib/conversations";
import type {
  CallLogInfo,
  CallMedia,
  CallParticipantInfo,
  CallState,
  CallStatus,
  CallSummary,
  IncomingCall,
  SignalInfo,
} from "@/lib/types";

const log = createLogger("calls");

/** Сколько звоним в личном чате, пока не пометим «пропущенным». */
export const RING_TIMEOUT_MS = 45_000;
/** Если ни один клиент не опрашивал звонок дольше этого — он «мёртв». */
export const DEAD_CALL_MS = 90_000;
/** Жёсткий потолок жизни комнаты (защита от забытых вкладок). */
export const MAX_CALL_MS = 12 * 60 * 60 * 1000;
/** Сколько сигнальных сообщений храним в очереди на пару участников. */
const MAX_UNREAD_SIGNALS = 400;

export { newJoinToken } from "@/db/schema";

/* ─────────────────────────── сериализация ─────────────────────────── */

function participantInfo(p: CallParticipant, u: User): CallParticipantInfo {
  return {
    userId: p.userId,
    user: publicUser(u),
    sdp: p.sdp,
    videoOn: !!p.videoOn,
    muted: !!p.muted,
    screenOn: !!p.screenOn,
    guest: !!p.guest,
    joinedAt: new Date(p.joinedAt).toISOString(),
    left: !!p.leftAt,
  };
}

export async function listParticipants(callId: string): Promise<CallParticipantInfo[]> {
  const rows = await db
    .select({ p: callParticipants, u: users })
    .from(callParticipants)
    .innerJoin(users, eq(callParticipants.userId, users.id))
    .where(eq(callParticipants.callId, callId))
    .orderBy(asc(callParticipants.joinedAt));
  return rows.map((r) => participantInfo(r.p, r.u));
}

type ConvRow = typeof conversations.$inferSelect;

/**
 * Заголовок диалога для звонка: у групп/каналов — название,
 * у личного чата — имя собеседника (того, кто не я).
 */
export async function callConvTitle(
  conv: ConvRow | null,
  meId: string,
  fallback?: string | null,
): Promise<string> {
  const kind = normalizeKind(conv?.kind ?? "direct");
  if (kind !== "direct") {
    return conv?.name?.trim() || (kind === "channel" ? "Канал" : "Группа");
  }
  if (!conv) return fallback ?? "Чат";
  const rows = await db
    .select({ u: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(
      and(
        eq(conversationMembers.conversationId, conv.id),
        ne(conversationMembers.userId, meId),
      ),
    )
    .limit(1);
  return rows[0]?.u.displayName ?? fallback ?? "Чат";
}

/** Полное состояние комнаты: участники, моя строка, адресованные мне сигналы. */
export async function buildCallState(
  call: Call,
  meId: string,
  opts: { deliverSignals?: boolean } = {},
): Promise<CallState> {
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, call.conversationId))
    .limit(1);
  const conv = convRows[0] ?? null;

  const partRows = await db
    .select({ p: callParticipants, u: users })
    .from(callParticipants)
    .innerJoin(users, eq(callParticipants.userId, users.id))
    .where(eq(callParticipants.callId, call.id))
    .orderBy(asc(callParticipants.joinedAt));

  const participants = partRows.map((r) => participantInfo(r.p, r.u));
  const mine = partRows.find((r) => r.p.userId === meId);
  const title = await callConvTitle(conv, meId);

  let signals: SignalInfo[] = [];
  if (opts.deliverSignals) {
    const rows = await db
      .select()
      .from(callSignals)
      .where(
        and(
          eq(callSignals.callId, call.id),
          eq(callSignals.toUserId, meId),
          isNull(callSignals.readAt),
          ne(callSignals.fromUserId, meId),
        ),
      )
      .orderBy(asc(callSignals.createdAt))
      .limit(MAX_UNREAD_SIGNALS);

    signals = rows.map((s) => ({
      id: s.id,
      from: s.fromUserId,
      kind: s.kind as SignalInfo["kind"],
      payload: s.payload,
    }));

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await db
        .update(callSignals)
        .set({ readAt: new Date() })
        .where(inArray(callSignals.id, ids));
    }
    // Прочитанные сигналы больше не нужны — чистим очередь, чтобы не росла
    await db
      .delete(callSignals)
      .where(
        and(
          eq(callSignals.callId, call.id),
          eq(callSignals.toUserId, meId),
          sql`${callSignals.createdAt} < now() - interval '10 minutes'`,
        ),
      )
      .catch(() => {});
  }

  return {
    call: {
      id: call.id,
      conversationId: call.conversationId,
      hostId: call.hostId,
      media: (call.media === "video" ? "video" : "audio") as CallMedia,
      status: call.status as CallStatus,
      joinToken: call.joinToken,
      startedAt: new Date(call.startedAt).toISOString(),
      answeredAt: call.answeredAt ? new Date(call.answeredAt).toISOString() : null,
      endedAt: call.endedAt ? new Date(call.endedAt).toISOString() : null,
      conversationTitle: title,
      conversationKind: normalizeKind(conv?.kind ?? "direct"),
    },
    participants,
    me: mine ? participantInfo(mine.p, mine.u) : null,
    signals,
  };
}

/** Краткая сводка для списков (сайдбар, шапка чата). */
export function callSummary(call: Call, participantCount: number): CallSummary {
  return {
    id: call.id,
    media: (call.media === "video" ? "video" : "audio") as CallMedia,
    status: call.status as CallStatus,
    participantCount,
    hostId: call.hostId,
    joinToken: call.joinToken,
    startedAt: new Date(call.startedAt).toISOString(),
  };
}

/* ─────────────────────────── доступ ─────────────────────────── */

export type CallAccess =
  | { ok: true; reason: "member" | "invite" | "token" | "public"; guest: boolean }
  | { ok: false; error: string; status: number };

/**
 * Кто может зайти в звонок:
 *  — участник диалога (всегда);
 *  — тот, кого пригласили в этот звонок (кнопка «добавить человека»);
 *  — тот, кто пришёл по ссылке-приглашению (для публичных диалогов — любой,
 *    для приватных — только если ссылку создали внутри, т.е. токен всё равно нужен);
 * Не-участники диалога попадают в комнату как «гости» (без доступа к переписке).
 */
export async function assertCanJoin(
  call: Call,
  userId: string,
  token?: string | null,
): Promise<CallAccess> {
  const membership = await getMembership(call.conversationId, userId);
  if (membership) return { ok: true, reason: "member", guest: false };

  const invited = await db
    .select()
    .from(callInvites)
    .where(and(eq(callInvites.callId, call.id), eq(callInvites.userId, userId)))
    .limit(1);
  if (invited[0]) return { ok: true, reason: "invite", guest: true };

  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, call.conversationId))
    .limit(1);
  const isPublic = conv[0] ? !conv[0].isPrivate : false;

  if (token && token === call.joinToken)
    return { ok: true, reason: isPublic ? "public" : "token", guest: true };

  return { ok: false, error: "Нет доступа к этому звонку", status: 403 };
}

/* ─────────────────────────── жизнь комнаты ─────────────────────────── */

/** Живой звонок в диалоге (ringing или live). */
export async function findActiveCall(conversationId: string): Promise<Call | null> {
  const rows = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.conversationId, conversationId),
        inArray(calls.status, ["ringing", "live"]),
      ),
    )
    .orderBy(sql`${calls.startedAt} desc`)
    .limit(1);
  return rows[0] ?? null;
}

/** Живые звонки сразу в нескольких диалогах + число участников. */
export async function findActiveCalls(conversationIds: string[]): Promise<
  Map<string, CallSummary>
> {
  const out = new Map<string, CallSummary>();
  if (conversationIds.length === 0) return out;

  const rows = await db
    .select({ call: calls, n: sql<number>`count(${callParticipants.userId})::int` })
    .from(calls)
    .leftJoin(callParticipants, eq(callParticipants.callId, calls.id))
    .where(
      and(
        inArray(calls.conversationId, conversationIds),
        inArray(calls.status, ["ringing", "live"]),
      ),
    )
    .groupBy(calls.id);

  for (const r of rows) out.set(r.call.conversationId, callSummary(r.call, Number(r.n ?? 0)));
  return out;
}

/** Вступает в комнату: создаёт/обновляет строку участника. */
export async function joinRoom(
  call: Call,
  userId: string,
  opts: { guest?: boolean; sdp?: string | null } = {},
): Promise<Call> {
  await db
    .insert(callParticipants)
    .values({
      callId: call.id,
      userId,
      sdp: opts.sdp ?? null,
      guest: !!opts.guest,
      leftAt: null,
    })
    .onConflictDoUpdate({
      target: [callParticipants.callId, callParticipants.userId],
      set: {
        leftAt: null,
        lastSeenAt: new Date(),
        // SDP не затираем, если новый не передан
        ...(opts.sdp ? { sdp: opts.sdp } : {}),
      },
    });

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(callParticipants)
    .where(eq(callParticipants.callId, call.id));

  const patch: Record<string, unknown> = {
    participantCount: sql`greatest(${calls.participantCount}, ${Number(n)})`,
  };
  // Первый присоединившийся собеседник переводит ЛС-звонок из «звонит» в «идёт»
  if (call.status === "ringing" && Number(n) > 1) {
    patch.status = "live";
    patch.answeredAt = new Date();
  }
  const [updated] = await db
    .update(calls)
    .set(patch)
    .where(eq(calls.id, call.id))
    .returning();

  log.info("Участник вошёл в звонок", {
    callId: call.id,
    userId,
    participants: String(n),
    guest: String(!!opts.guest),
  });
  return updated ?? call;
}

/**
 * Покинуть комнату. Групповой звонок живёт, пока в нём кто-то есть;
 * личный (1:1) завершается, как только выходит любой из двоих.
 */
export async function leaveRoom(call: Call, userId: string): Promise<Call> {
  await db
    .delete(callParticipants)
    .where(and(eq(callParticipants.callId, call.id), eq(callParticipants.userId, userId)));
  await db
    .delete(callInvites)
    .where(and(eq(callInvites.callId, call.id), eq(callInvites.userId, userId)));

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(callParticipants)
    .where(eq(callParticipants.callId, call.id));
  const left = Number(n ?? 0);

  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, call.conversationId))
    .limit(1)
    .then((r) => r[0] ?? null);
  const isDirect = normalizeKind(conv?.kind ?? "direct") === "direct";

  if (left === 0 || (isDirect && left < 2)) return endCall(call, "last-left");

  const [fresh] = await db.select().from(calls).where(eq(calls.id, call.id)).limit(1);
  return fresh ?? call;
}

/** Завершить звонок + записать лог в чат. */
export async function endCall(
  call: Call,
  reason: "hangup" | "last-left" | "stale" | "host-ended" | "declined" | "missed" = "hangup",
): Promise<Call> {
  if (call.status === "ended" || call.status === "missed" || call.status === "declined") {
    return call;
  }
  const durationSec = call.answeredAt
    ? Math.max(0, Math.round((Date.now() - new Date(call.answeredAt).getTime()) / 1000))
    : 0;

  const status: CallStatus =
    reason === "declined" ? "declined" : reason === "missed" ? "missed" : "ended";
  const [updated] = await db
    .update(calls)
    .set({ status, endedAt: new Date() })
    .where(eq(calls.id, call.id))
    .returning();

  const logStatus: CallLogInfo["status"] =
    reason === "declined"
      ? "declined"
      : reason === "missed"
        ? "missed"
        : durationSec > 0
          ? "ended"
          : "cancelled";
  await insertCallLog(call, logStatus, durationSec, call.participantCount || 0);

  // Комнаты больше нет — сигналы и приглашения не нужны
  await db.delete(callSignals).where(eq(callSignals.callId, call.id)).catch(() => {});
  await db.delete(callInvites).where(eq(callInvites.callId, call.id)).catch(() => {});
  await db.delete(callParticipants).where(eq(callParticipants.callId, call.id)).catch(() => {});

  log.info("Звонок завершён", {
    callId: call.id,
    reason,
    durationSec: String(durationSec),
    participants: String(call.participantCount),
  });
  return updated ?? { ...call, status, endedAt: new Date() };
}

/**
 * Записывает в чат системное сообщение о звонке.
 * Идемпотентно: у сообщения есть call_id с unique-индексом.
 */
export async function insertCallLog(
  call: Call,
  status: CallLogInfo["status"],
  durationSec: number,
  participants = 0,
) {
  try {
    const info: CallLogInfo = {
      callId: call.id,
      status,
      durationSec,
      callerId: call.hostId,
      media: call.media === "video" ? "video" : "audio",
      participants: Math.max(participants, 0),
    };
    await db
      .insert(messages)
      .values({
        conversationId: call.conversationId,
        senderId: call.hostId,
        type: "call",
        content: JSON.stringify(info),
        callId: call.id,
      })
      .onConflictDoNothing();
  } catch (err) {
    log.error("Не удалось записать лог звонка в чат", {
      callId: call.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Ленивая уборка «мёртвых» звонков:
 *  — ringing дольше RING_TIMEOUT_MS → missed (в ЛС никто не ответил);
 *  — live без единого heartbeat дольше DEAD_CALL_MS → ended (все закрыли вкладки);
 *  — live дольше MAX_CALL_MS → ended.
 * Возвращает живые звонки (id диалога → звонок) для переданного набора диалогов.
 */
export async function sweepStaleCalls(conversationIds: string[]): Promise<Map<string, Call>> {
  const alive = new Map<string, Call>();
  if (conversationIds.length === 0) return alive;

  const rows = await db
    .select()
    .from(calls)
    .where(
      and(
        inArray(calls.conversationId, conversationIds),
        inArray(calls.status, ["ringing", "live"]),
      ),
    );

  for (const call of rows) {
    const age = Date.now() - new Date(call.startedAt).getTime();

    if (call.status === "ringing" && age > RING_TIMEOUT_MS) {
      await endCall(call, "missed");
      continue;
    }

    if (call.status === "live") {
      const [{ n, last }] = await db
        .select({
          n: sql<number>`count(*)::int`,
          // epoch в миллисекундах — не зависит от таймзоны сессии
          last: sql<number | null>`(extract(epoch from max(${callParticipants.lastSeenAt})) * 1000)::bigint`,
        })
        .from(callParticipants)
        .where(eq(callParticipants.callId, call.id));

      const noOne = Number(n ?? 0) === 0;
      const lastSeen = Number(last ?? 0);
      const silent = !lastSeen || Date.now() - lastSeen > DEAD_CALL_MS;
      if (noOne || silent || age > MAX_CALL_MS) {
        await endCall(call, "stale");
        continue;
      }
    }

    alive.set(call.conversationId, call);
  }
  return alive;
}

/**
 * Из набора живых звонков (диалог → звонок) делает краткие сводки
 * с актуальным числом участников — одним запросом на всех сразу.
 */
export async function toCallSummaries(map: Map<string, Call>): Promise<Map<string, CallSummary>> {
  const out = new Map<string, CallSummary>();
  if (map.size === 0) return out;

  const callList = Array.from(map.values());
  const rows = await db
    .select({ callId: callParticipants.callId, n: sql<number>`count(*)::int` })
    .from(callParticipants)
    .where(inArray(callParticipants.callId, callList.map((c) => c.id)))
    .groupBy(callParticipants.callId);
  const countById = new Map(rows.map((r) => [r.callId, Number(r.n)]));

  for (const [convId, call] of map) out.set(convId, callSummary(call, countById.get(call.id) ?? 0));
  return out;
}

/* ─────────────────────────── входящие ─────────────────────────── */

/**
 * Звонки, которые «видит» пользователь и в которых он ещё не участвует:
 *  — ringing/live в его диалогах;
 *  — звонки, куда его пригласили лично (кнопка «добавить человека»);
 *  — звонок, куда он пришёл по ссылке (token) — даже без участия в диалоге.
 */
export async function listIncomingFor(userId: string, token?: string | null): Promise<IncomingCall[]> {
  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const convIds = myConvs.map((c) => c.conversationId);

  const invitedRows = await db
    .select({ callId: callInvites.callId })
    .from(callInvites)
    .where(eq(callInvites.userId, userId));
  const invitedCallIds = invitedRows.map((r) => r.callId);

  const tokenCall = token
    ? await db.select().from(calls).where(eq(calls.joinToken, token)).limit(1).then((r) => r[0] ?? null)
    : null;

  const found = await db
    .select()
    .from(calls)
    .where(
      and(
        inArray(calls.status, ["ringing", "live"]),
        gt(calls.startedAt, new Date(Date.now() - MAX_CALL_MS)),
        or(
          convIds.length > 0 ? inArray(calls.conversationId, convIds) : sql`false`,
          invitedCallIds.length > 0 ? inArray(calls.id, invitedCallIds) : sql`false`,
          tokenCall ? eq(calls.id, tokenCall.id) : sql`false`,
        ),
      ),
    )
    .orderBy(sql`${calls.startedAt} desc`)
    .limit(10);

  const mine = await db
    .select()
    .from(callParticipants)
    .where(eq(callParticipants.userId, userId));
  const joinedIds = new Set(mine.map((m) => m.callId));

  const result: IncomingCall[] = [];
  for (const call of found) {
    if (joinedIds.has(call.id)) continue; // я уже в комнате
    const conv = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, call.conversationId))
      .limit(1)
      .then((r) => r[0] ?? null);
    const kind = normalizeKind(conv?.kind ?? "direct");
    const host = await db
      .select()
      .from(users)
      .where(eq(users.id, call.hostId))
      .limit(1)
      .then((r) => r[0] ?? null);
    const participants = await listParticipants(call.id);
    const title = await callConvTitle(conv, userId, host?.displayName ?? null);

    result.push({
      id: call.id,
      conversationId: call.conversationId,
      conversationTitle: title,
      conversationKind: kind,
      conversationAvatar: conv?.avatarUrl ?? host?.avatarUrl ?? null,
      media: (call.media === "video" ? "video" : "audio") as CallMedia,
      status: call.status as CallStatus,
      joinToken: call.joinToken,
      hostId: call.hostId,
      host: host ? publicUser(host) : null,
      participants,
      startedAt: new Date(call.startedAt).toISOString(),
    });
  }
  return result;
}

/** Пригласить человека в звонок (он увидит его во входящих). */
export async function inviteToCall(
  call: Call,
  targetUserId: string,
  invitedBy: string,
): Promise<boolean> {
  const target = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target[0]) return false;
  await db
    .insert(callInvites)
    .values({ callId: call.id, userId: targetUserId, invitedBy })
    .onConflictDoNothing();
  log.info("Приглашение в звонок", {
    callId: call.id,
    to: target[0].username,
    from: invitedBy,
  });
  return true;
}

/** Пользователь звонка (для логов/сериализации). */
export async function getCallHost(call: Call): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, call.hostId)).limit(1);
  return rows[0] ?? null;
}
