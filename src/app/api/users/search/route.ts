import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userBlocks, users } from "@/db/schema";
import { ne, or, and, eq, inArray, sql } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

export const GET = withApi("users:search", async ({ req, me }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });

  // Экранируем спецсимволы ILIKE, чтобы «_» в юзернеймах искался буквально
  const esc = q.replace(/([%_\\])/g, "\\$1");
  const pattern = `%${esc}%`;
  const found = await db
    .select()
    .from(users)
    .where(
      and(
        ne(users.id, me.id),
        eq(users.discoverable, true),
        or(
          sql`${users.username} ILIKE ${pattern} ESCAPE '\\'`,
          sql`${users.displayName} ILIKE ${pattern} ESCAPE '\\'`,
        ),
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
