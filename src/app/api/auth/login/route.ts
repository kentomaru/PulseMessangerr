import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, publicUser, verifyPassword } from "@/lib/auth";
import { withPublicApi } from "@/lib/api-helpers";

export const POST = withPublicApi("auth/login", async ({ req, log }) => {
  const body = await req.json();
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.passwordHash)) {
    log.warn("Неудачный вход", { username });
    return NextResponse.json({ error: "Неверное имя пользователя или пароль" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
});
