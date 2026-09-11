import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ilike, ne, or, and } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

export const GET = withApi("users:search", async ({ req, me }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
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
});
