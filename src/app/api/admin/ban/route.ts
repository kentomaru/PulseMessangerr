import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages, sessions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { isUuid } from "@/lib/api-helpers";

type Mode = "ban" | "wipe" | "delete" | "unban" | "restore";

/**
 * Админка: действия над аккаунтом.
 *  — ban:     заблокировать навсегда (данные остаются);
 *  — wipe:    заблокировать + стереть все сообщения пользователя;
 *  — delete:  удалить аккаунт: он отображается как «Удалённый аккаунт»
 *             с аватаром-призраком, вход закрыт (можно восстановить);
 *  — unban:   разблокировать;
 *  — restore: откатить полное удаление (вернуть аккаунт).
 */
export const POST = withApi("admin/ban", async ({ req, me, log }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  const mode = String(body.mode ?? "") as Mode;
  const reason = String(body.reason ?? "").trim().slice(0, 200);

  if (!isUuid(userId)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (!["ban", "wipe", "delete", "unban", "restore"].includes(mode))
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

  if (mode === "restore") {
    await db
      .update(users)
      .set({ bannedAt: null, banReason: null, deletedAt: null })
      .where(eq(users.id, userId));
    log.info("Админ восстановил аккаунт", { by: me.username, who: target.username });
    return NextResponse.json({ ok: true, restored: true });
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
    // «Удалённый аккаунт»: призрак в чатах, вход закрыт, можно восстановить
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    // Все живые сессии — долой
    await db.delete(sessions).where(eq(sessions.userId, userId));
    log.info("Админ удалил аккаунт (мягко)", { by: me.username, who: target.username });
    return NextResponse.json({ ok: true, deleted: true });
  }

  log.info("Админ заблокировал пользователя", { by: me.username, who: target.username, mode, reason });
  return NextResponse.json({ ok: true });
});
