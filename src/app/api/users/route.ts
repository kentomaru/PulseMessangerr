import { db } from "@/db";
import { users } from "@/db/schema";
import { and, asc, ilike, ne, or } from "drizzle-orm";
import { getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      handle: users.handle,
      emoji: users.emoji,
      accent: users.accent,
      about: users.about,
      avatarFileId: users.avatarFileId,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .where(
      q
        ? and(
            ne(users.id, me.id),
            or(ilike(users.name, `%${q}%`), ilike(users.handle, `%${q}%`)),
          )
        : ne(users.id, me.id),
    )
    .orderBy(asc(users.id))
    .limit(30);
  return Response.json({
    users: rows.map((r) => ({ ...r, lastSeenAt: r.lastSeenAt.toISOString() })),
  });
}
