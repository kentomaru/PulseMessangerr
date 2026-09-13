import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationBans, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";
import { isManager, requireMember } from "@/lib/conversations";

/**
 * GET /api/conversations/[id]/bans — список забаненных (только админам).
 */
export const GET = withApi<{ id: string }>("conversations:bans", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (!isManager(access.membership.role))
    return NextResponse.json({ error: "Список банов видят только админы" }, { status: 403 });

  const rows = await db
    .select({ ban: conversationBans, user: users })
    .from(conversationBans)
    .innerJoin(users, eq(users.id, conversationBans.userId))
    .where(eq(conversationBans.conversationId, id));

  return NextResponse.json({
    bans: rows.map((r) => ({
      user: publicUser(r.user),
      bannedAt: new Date(r.ban.createdAt).toISOString(),
    })),
  });
});
