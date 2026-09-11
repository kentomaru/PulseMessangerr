import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { isFileUrl } from "@/lib/message-content";

/**
 * Общие обои диалога: выбранное значение видят все его участники.
 * Значение: ключ пресета ("g1"…"g10"), url картинки (/api/files/…) или null (сброс).
 */
export const POST = withApi<{ id: string }>("conversations:wallpaper", async ({ req, params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const body = await req.json();
  const wallpaper = body.wallpaper;

  let value: string | null = null;
  if (typeof wallpaper === "string") {
    const v = wallpaper.trim().slice(0, 300);
    // Разрешаем только ключи пресетов или собственные загруженные файлы
    if (v === "" || v === "none") value = null;
    else if (/^g\d{1,2}$/.test(v)) value = v;
    else if (isFileUrl(v)) value = v;
    else return NextResponse.json({ error: "Недопустимое значение обоев" }, { status: 400 });
  } else if (wallpaper !== null && wallpaper !== undefined) {
    return NextResponse.json({ error: "Недопустимое значение обоев" }, { status: 400 });
  }

  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, id));
  if (members.length === 0) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  if (!members.some((member) => member.userId === me.id))
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  // Обои — общая настройка диалога: оба участника видят один и тот же фон.
  await db
    .update(conversationMembers)
    .set({ wallpaper: value })
    .where(eq(conversationMembers.conversationId, id));

  return NextResponse.json({ wallpaper: value });
});
