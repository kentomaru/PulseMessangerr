import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** GET /api/users/:id/common — общие с пользователем группы и каналы. */
export const GET = withApi<{ id: string }>("users:common", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const rows = await db.execute(
    sql`select c.id, c.title, c.kind, c.avatar_url as "avatarUrl"
        from conversations c
        join conversation_members a on a.conversation_id = c.id and a.user_id = ${me.id}
        join conversation_members b on b.conversation_id = c.id and b.user_id = ${id}
        where c.kind in ('group', 'channel')
        order by c.title
        limit 50`,
  );
  return NextResponse.json({ common: rows });
});
