import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { or, ilike, desc } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";

/**
 * Админка: список пользователей с поиском.
 * Доступ — только администраторам платформы (users.is_admin).
 */
export const GET = withApi("admin/users", async ({ req, me }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const where = q
    ? or(ilike(users.username, `%${q}%`), ilike(users.displayName, `%${q}%`))
    : undefined;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      premium: users.premium,
      isAdmin: users.isAdmin,
      bannedAt: users.bannedAt,
      banReason: users.banReason,
      deletedAt: users.deletedAt,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(60);

  return NextResponse.json({
    users: rows.map((r) => ({
      ...r,
      bannedAt: r.bannedAt ? new Date(r.bannedAt).toISOString() : null,
      deletedAt: r.deletedAt ? new Date(r.deletedAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : null,
    })),
  });
});
