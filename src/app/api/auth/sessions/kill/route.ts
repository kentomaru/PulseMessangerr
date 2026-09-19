import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, eq, ne, inArray } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

/**
 * POST /api/auth/sessions/kill — завершить сессию (свою):
 *  — { token }       → одно устройство;
 *  — { allOthers: 1 } → все, кроме текущего.
 */
export const POST = withApi("auth/sessions:kill", async ({ req, me }) => {
  const body = await req.json().catch(() => ({}));
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value ?? "";

  if (body.allOthers) {
    const rows = await db
      .delete(sessions)
      .where(and(eq(sessions.userId, me.id), ne(sessions.token, current)))
      .returning({ token: sessions.token });
    return NextResponse.json({ ok: true, killed: rows.length });
  }

  const token = String(body.token ?? "");
  if (!token || token === current)
    return NextResponse.json({ error: "Текущую сессию завершить нельзя — выйдите из аккаунта" }, { status: 400 });
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, me.id), inArray(sessions.token, [token])))
    .returning({ token: sessions.token });
  if (rows.length === 0) return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
