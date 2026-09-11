import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ilike, ne, or, and } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  const found = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, me.id),
        or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
      ),
    )
    .limit(20);

  return NextResponse.json({ users: found.map(publicUser) });
}
