import { NextResponse } from "next/server";
import { db } from "@/db";
import { stories, storyViews, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";

/** DELETE /api/stories/[id] — удалить свою историю. */
export const DELETE = withApi<{ id: string }>("stories:delete", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "История не найдена" }, { status: 404 });
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, id), eq(stories.userId, me.id)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "История не найдена" }, { status: 404 });

  await db.delete(stories).where(eq(stories.id, id));
  log.info("История удалена", { storyId: id, userId: me.id });
  return NextResponse.json({ ok: true });
});

/** GET /api/stories/[id] — список просмотров своей истории. */
export const GET = withApi<{ id: string }>("stories:views", async ({ params, me }) => {
  const { id } = params;
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, id), eq(stories.userId, me.id)))
    .limit(1);
  if (!rows[0]) return NextResponse.json({ error: "История не найдена" }, { status: 404 });

  const views = await db
    .select({ user: users, viewedAt: storyViews.viewedAt })
    .from(storyViews)
    .innerJoin(users, eq(storyViews.userId, users.id))
    .where(eq(storyViews.storyId, id))
    .orderBy(desc(storyViews.viewedAt))
    .limit(100);

  return NextResponse.json({
    views: views.map((v) => ({ user: publicUser(v.user), viewedAt: v.viewedAt })),
  });
});
