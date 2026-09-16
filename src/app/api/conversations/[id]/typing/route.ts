import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** Индикатор «печатает…» / «записывает голосовое»: собеседник видит это ~10 секунд. */
export const POST = withApi<{ id: string }>("conversations:typing", async ({ req, params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const recording = body.recording === true;
  const stopRecording = body.recording === false;
  await db
    .update(conversationMembers)
    .set({
      typingAt: recording || stopRecording ? undefined : new Date(),
      recordingAt: recording ? new Date() : stopRecording ? null : undefined,
    })
    .where(
      and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)),
    );
  return NextResponse.json({ ok: true });
});
