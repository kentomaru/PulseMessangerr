import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, publicUser, verifyPassword } from "@/lib/auth";
import { withPublicApi } from "@/lib/api-helpers";
import { checkRateLimit } from "@/lib/rate-limit";

export const POST = withPublicApi("auth/login", async ({ req, log }) => {
  const body = await req.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // Защита от перебора пароля: 8 попыток на (IP+логин) за 5 минут.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(`${ip}:${username}`)) {
    return NextResponse.json(
      { error: "Слишком много попыток входа. Подождите несколько минут." },
      { status: 429 },
    );
  }

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    log.warn("Неудачный вход", { username });
    return NextResponse.json({ error: "Неверное имя пользователя или пароль" }, { status: 401 });
  }
  // Блокировка администратором: вход закрыт, причина показывается
  if (user.bannedAt) {
    log.warn("Вход заблокированного аккаунта", { username });
    return NextResponse.json(
      { error: `Аккаунт заблокирован администратором. Причина: ${user.banReason || "не указана"}` },
      { status: 403 },
    );
  }

  await createSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
});
