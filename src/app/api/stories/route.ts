import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stories, storyViews, users } from "@/db/schema";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

/**
 * GET /api/stories — активные истории (24 ч), сгруппированные по пользователям.
 * Свои — первыми. Просроченные чистятся лениво.
 */
export const GET = withApi("stories", async ({ me, log }) => {
  // ленивая очистка просроченных
  try {
    await db.delete(stories).where(lt(stories.expiresAt, new Date()));
  } catch (err) {
    log.warn("Не удалось удалить просроченные истории", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const active = await db
    .select({ story: stories, user: users })
    .from(stories)
    .innerJoin(users, eq(stories.userId, users.id))
    .where(gt(stories.expiresAt, new Date()))
    .orderBy(asc(stories.createdAt))
    .limit(200);

  if (active.length === 0) return NextResponse.json({ groups: [] });

  const storyIds = active.map((r) => r.story.id);
  const myViews = await db
    .select({ storyId: storyViews.storyId })
    .from(storyViews)
    .where(and(eq(storyViews.userId, me.id), inArray(storyViews.storyId, storyIds)));
  const viewedSet = new Set(myViews.map((v) => v.storyId));

  const viewCounts = await db
    .select({ storyId: storyViews.storyId, count: sql<number>`count(*)::int` })
    .from(storyViews)
    .where(inArray(storyViews.storyId, storyIds))
    .groupBy(storyViews.storyId);
  const countMap = new Map(viewCounts.map((v) => [v.storyId, Number(v.count)]));

  // группировка по пользователю (своя лента — первой)
  const byUser = new Map<string, { user: ReturnType<typeof publicUser>; stories: unknown[] }>();
  for (const row of active) {
    const key = row.user.id;
    if (!byUser.has(key)) byUser.set(key, { user: publicUser(row.user), stories: [] });
    byUser.get(key)!.stories.push({
      id: row.story.id,
      userId: row.story.userId,
      mediaUrl: row.story.mediaUrl,
      caption: row.story.caption,
      createdAt: row.story.createdAt,
      expiresAt: row.story.expiresAt,
      viewed: viewedSet.has(row.story.id) || row.user.id === me.id,
      viewCount: countMap.get(row.story.id) ?? 0,
    });
  }

  const groups = Array.from(byUser.values());
  groups.sort((a, b) => {
    const aMine = a.user.id === me.id ? 0 : 1;
    const bMine = b.user.id === me.id ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    const at = new Date((a.stories[0] as { createdAt: string }).createdAt).getTime();
    const bt = new Date((b.stories[0] as { createdAt: string }).createdAt).getTime();
    return bt - at;
  });

  return NextResponse.json({ groups });
});

/** POST /api/stories — опубликовать историю { mediaUrl, caption }. */
export const POST = withApi("stories:create", async ({ req, me, log }) => {
  const body = await req.json();
  const mediaUrl = String(body.mediaUrl ?? "");
  const caption = String(body.caption ?? "").trim().slice(0, 140);

  if (!mediaUrl.startsWith("/api/files/"))
    return NextResponse.json({ error: "Сначала загрузите изображение" }, { status: 400 });

  const [story] = await db
    .insert(stories)
    .values({
      userId: me.id,
      mediaUrl,
      caption,
      expiresAt: new Date(
        Date.now() +
          // Pulse Premium: сторис живут до 48 часов — как в ТГ
          (me.premium && body.ttlHours === 48 ? 48 * 60 * 60 * 1000 : STORY_TTL_MS),
      ),
    })
    .returning();

  log.info("История опубликована", { storyId: story.id, userId: me.id });
  return NextResponse.json({ story: { ...story, viewed: true, viewCount: 0 } });
});
