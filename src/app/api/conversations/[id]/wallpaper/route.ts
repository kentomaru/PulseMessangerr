import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * Личные обои чата: каждый участник задаёт свои.
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
    // Разрешаем только ключи пресетов (обычные «g…» и живые «live…»)
    // или собственные загруженные файлы
    if (v === "" || v === "none") value = null;
    else if (/^(g|live)\d{1,2}$/.test(v)) value = v;
    else if (v.startsWith("/api/files/")) value = v;
    else return NextResponse.json({ error: "Недопустимое значение обоев" }, { status: 400 });
  } else if (wallpaper !== null && wallpaper !== undefined) {
    return NextResponse.json({ error: "Недопустимое значение обоев" }, { status: 400 });
  }

  const updated = await db
    .update(conversationMembers)
    .set({ wallpaper: value })
    .where(
      and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)),
    )
    .returning();

  if (updated.length === 0)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  return NextResponse.json({ wallpaper: value });
});
