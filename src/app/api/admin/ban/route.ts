import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { isUuid } from "@/lib/api-helpers";

type Mode = "ban" | "wipe" | "delete" | "unban";

/**
 * Админка: действия над аккаунтом.
 *  — ban:    заблокировать навсегда (данные остаются);
 *  — wipe:   заблокировать + стереть все сообщения пользователя;
 *  — delete: удалить аккаунт полностью (с сообщениями);
 *  — unban:  разблокировать.
 */
export const POST = withApi("admin/ban", async ({ req, me, log }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const mode = String(body.mode ?? "") as Mode;
  const reason = String(body.reason ?? "").trim().slice(0, 200);

  if (!isUuid(userId)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (!["ban", "wipe", "delete", "unban"].includes(mode))
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  if (userId === me.id)
    return NextResponse.json({ error: "Нельзя применить к себе" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (target.isAdmin)
    return NextResponse.json({ error: "Действия над администраторами недоступны" }, { status: 403 });

  if (mode === "unban") {
    await db.update(users).set({ bannedAt: null, banReason: null }).where(eq(users.id, userId));
    log.info("Админ разблокировал пользователя", { by: me.username, who: target.username });
    return NextResponse.json({ ok: true });
  }

  // Блокировка (все режимы)
  await db
    .update(users)
    .set({ bannedAt: new Date(), banReason: reason || "Нарушение правил сервиса" })
    .where(eq(users.id, userId));

  if (mode === "wipe" || mode === "delete") {
    // Стираем все сообщения пользователя (реакции/вложения уйдут каскадом)
    await db.delete(messages).where(eq(messages.senderId, userId));
  }

  if (mode === "delete") {
    // Полное удаление аккаунта: участники/сессии/реакции — каскадом по FK
    await db.delete(users).where(eq(users.id, userId));
    log.info("Админ удалил аккаунт", { by: me.username, who: target.username });
    return NextResponse.json({ ok: true, deleted: true });
  }

  log.info("Админ заблокировал пользователя", { by: me.username, who: target.username, mode, reason });
  return NextResponse.json({ ok: true });
});
