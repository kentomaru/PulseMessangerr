import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userBlocks, users } from "@/db/schema";
import { ilike, ne, or, and, eq, inArray } from "drizzle-orm";
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
        eq(users.discoverable, true),
        or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
      ),
    )
    .limit(20);

  // Чёрный список: заблокированные друг для друга не видны в поиске
  const ids = found.map((u) => u.id);
  const blocks = ids.length
    ? await db
        .select()
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, me.id), inArray(userBlocks.blockedId, ids)),
            and(eq(userBlocks.blockedId, me.id), inArray(userBlocks.blockerId, ids)),
          ),
        )
    : [];
  const hidden = new Set(
    blocks.flatMap((b) => [b.blockerId, b.blockedId]),
  );

  return NextResponse.json({ users: found.filter((u) => !hidden.has(u.id)).map(publicUser) });
});
