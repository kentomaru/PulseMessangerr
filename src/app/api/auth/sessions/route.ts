import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

/**
 * GET /api/auth/sessions — «Устройства»: список активных сессий аккаунта.
 */
export const GET = withApi("auth/sessions", async ({ me }) => {
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value ?? "";
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, me.id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
  return NextResponse.json({
    sessions: rows.map((r) => ({
      token: r.token,
      userAgent: r.userAgent ?? "",
      ip: r.ip ?? "",
      createdAt: new Date(r.createdAt).toISOString(),
      expiresAt: new Date(r.expiresAt).toISOString(),
      current: r.token === current,
    })),
  });
});
