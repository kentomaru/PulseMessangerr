/**
 * Серверные помощники для звонков (WebRTC-сигналинг через БД).
 * Клиентская логика звонков — в src/lib/useCallController.ts (этот файл — только для сервера).
 */
import { db } from "@/db";
import { calls, messages, users, type Call, type User } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import type { CallLogInfo, CallMedia, CallPayload, CallStatus } from "@/lib/types";

const log = createLogger("calls");

export const RING_TIMEOUT_MS = 40_000;

/** Перевод строки БД в JSON-ответ API (даты → ISO-строки). */
export function serializeCall(c: Call, caller?: User | null): CallPayload {
  return {
    id: c.id,
    conversationId: c.conversationId,
    callerId: c.callerId,
    calleeId: c.calleeId,
    media: (c.media === "video" ? "video" : "audio") as CallMedia,
    status: c.status as CallStatus,
    offerSdp: c.offerSdp,
    answerSdp: c.answerSdp,
    callerIce: Array.isArray(c.callerIce) ? c.callerIce : [],
    calleeIce: Array.isArray(c.calleeIce) ? c.calleeIce : [],
    createdAt: new Date(c.createdAt).toISOString(),
    answeredAt: c.answeredAt ? new Date(c.answeredAt).toISOString() : null,
    endedAt: c.endedAt ? new Date(c.endedAt).toISOString() : null,
    caller: caller ? publicUser(caller) : undefined,
  };
}

/**
 * Записывает в чат системное сообщение о звонке.
 * Идемпотентно: у сообщения есть call_id с unique-индексом,
 * поэтому повторная попытка (например, обе стороны фиксируют «пропущенный»)
 * не создаст дубликат.
 */
export async function insertCallLog(
  call: Call,
  status: CallLogInfo["status"],
  durationSec: number,
) {
  try {
    const info: CallLogInfo = {
      callId: call.id,
      status,
      durationSec,
      callerId: call.callerId,
      media: call.media === "video" ? "video" : "audio",
    };
    await db
      .insert(messages)
      .values({
        conversationId: call.conversationId,
        senderId: call.callerId,
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
 * Помечает звонок «пропущенным», если он звонит дольше RING_TIMEOUT_MS.
 * Возвращает свежую строку звонка.
 */
export async function expireIfStale(call: Call): Promise<Call> {
  if (
    call.status === "ringing" &&
    Date.now() - new Date(call.createdAt).getTime() > RING_TIMEOUT_MS
  ) {
    const rows = await db
      .update(calls)
      .set({ status: "missed", endedAt: new Date() })
      .where(eq(calls.id, call.id))
      .returning();
    log.info("Звонок истёк без ответа", { callId: call.id, conversationId: call.conversationId });
    await insertCallLog(call, "missed", 0);
    return rows[0] ?? call;
  }
  return call;
}

/** Активный звонок, висящий дольше этого времени, считаем «зомби». */
export const ACTIVE_ZOMBIE_MS = 4 * 60 * 60 * 1000;

/**
 * Закрывает в чате «повисшие» звонки:
 *  — ringing дольше RING_TIMEOUT_MS (40 с) → missed;
 *  — active дольше ACTIVE_ZOMBIE_MS (4 ч) → ended (браузер закрылся без hangup).
 * Возвращает оставшийся живой звонок (или null, если чат свободен).
 */
export async function closeStaleCalls(conversationId: string): Promise<Call | null> {
  const rows = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.conversationId, conversationId),
        inArray(calls.status, ["ringing", "active"]),
      ),
    );

  let alive: Call | null = null;
  for (const row of rows) {
    const startedAt = new Date(row.answeredAt ?? row.createdAt).getTime();
    const age = Date.now() - startedAt;
    const staleRinging = row.status === "ringing" && age > RING_TIMEOUT_MS;
    const staleActive = row.status === "active" && age > ACTIVE_ZOMBIE_MS;

    if (staleRinging || staleActive) {
      await db
        .update(calls)
        .set({ status: staleRinging ? "missed" : "ended", endedAt: new Date() })
        .where(eq(calls.id, row.id));
      await insertCallLog(row, staleRinging ? "missed" : "ended", 0);
      log.info("Закрыт повисший звонок", {
        callId: row.id,
        conversationId,
        was: row.status,
        ageSec: String(Math.round(age / 1000)),
      });
      continue;
    }
    if (!alive || new Date(row.createdAt) > new Date(alive.createdAt)) alive = row;
  }
  return alive;
}

/** Достаёт пользователя-звонящего для_payload'а. */
export async function getCallCaller(call: Call): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, call.callerId)).limit(1);
  return rows[0] ?? null;
}
