import { db } from "@/db";
import { calls, messages, type Call } from "@/db/schema";
import { eq } from "drizzle-orm";

export const RING_TIMEOUT_MS = 40_000;

export async function insertCallLog(
  call: Call,
  status: "ended" | "missed" | "declined",
  durationSec: number,
) {
  try {
    await db.insert(messages).values({
      chatId: call.chatId,
      senderId: call.callerId,
      kind: "call",
      body: JSON.stringify({ status, durationSec, callerId: call.callerId }),
    });
  } catch (e) {
    console.error("call log insert failed", e);
  }
}

/** Marks a ringing call as missed if it has been ringing too long. Returns fresh call row. */
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
    await insertCallLog(call, "missed", 0);
    return rows[0] ?? call;
  }
  return call;
}

export function callPeerFrom(user: {
  id: number;
  name: string;
  handle: string;
  emoji: string;
  accent: string;
  avatarFileId: number | null;
}) {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    emoji: user.emoji,
    accent: user.accent,
    avatarFileId: user.avatarFileId,
  };
}
