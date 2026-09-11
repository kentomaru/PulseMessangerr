import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

/** Выйти со всех устройств (все сессии, кроме текущей, удаляются, текущая — тоже). */
export const POST = withApi("auth/logout-all", async ({ me, log }) => {
  await db.delete(sessions).where(eq(sessions.userId, me.id));
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  log.info("Пользователь вышел со всех устройств", { userId: me.id });
  return NextResponse.json({ ok: true });
});
