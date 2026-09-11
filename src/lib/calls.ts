/**
 * Серверные помощники для звонков (WebRTC-сигналинг через БД).
 * Клиентская логика звонков — в src/lib/useCallController.ts (этот файл — только для сервера).
 */
import { db } from "@/db";
import { calls, messages, users, type Call, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
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

/** Достаёт пользователя-звонящего для_payload'а. */
export async function getCallCaller(call: Call): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, call.callerId)).limit(1);
  return rows[0] ?? null;
}
