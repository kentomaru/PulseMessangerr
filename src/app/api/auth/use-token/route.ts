import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { withPublicApi } from "@/lib/api-helpers";
import { publicUser, setSessionCookie } from "@/lib/auth";

/**
 * POST /api/auth/use-token — переключение аккаунта по сохранённому токену
 * (мультиаккаунт: до 5 аккаунтов в приложении, как в ТГ).
 */
export const POST = withPublicApi("auth/use-token", async ({ req }) => {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  if (!token) return NextResponse.json({ error: "Нет токена" }, { status: 400 });

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Сессия истекла — войдите заново" }, { status: 401 });
  if (row.user.bannedAt || row.user.deletedAt)
    return NextResponse.json({ error: "Аккаунт недоступен" }, { status: 403 });

  await setSessionCookie(row.session.token, row.session.expiresAt);
  return NextResponse.json({ user: publicUser(row.user), token: row.session.token });
});
