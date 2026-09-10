import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await ctx.params;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  return NextResponse.json({ user: publicUser(rows[0]) });
}
