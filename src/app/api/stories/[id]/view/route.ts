import { NextResponse } from "next/server";
import { db } from "@/db";
import { stories, storyViews } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** POST /api/stories/[id]/view — отметить историю просмотренной (свой счётчик не растёт). */
export const POST = withApi<{ id: string }>("stories:view", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "История не найдена" }, { status: 404 });
  const rows = await db.select().from(stories).where(eq(stories.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "История не найдена" }, { status: 404 });

  if (rows[0].userId !== me.id) {
    await db
      .insert(storyViews)
      .values({ storyId: id, userId: me.id })
      .onConflictDoNothing()
      .catch(() => {});
  }
  return NextResponse.json({ ok: true });
});
