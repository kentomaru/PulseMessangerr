import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userBlocks, users } from "@/db/schema";
import { withApi } from "@/lib/api-helpers";

/** Чёрный список: POST { userId, block } ; GET — мои блоки. */
export const GET = withApi("users:block", async ({ me }) => {
  const rows = await db
    .select({ user: users })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, me.id));
  return NextResponse.json({ blocked: rows.map((r) => r.user.id) });
});

export const POST = withApi("users:block", async ({ req, me, log }) => {
  const body = (await req.json().catch(() => ({}))) as { userId?: string; block?: boolean };
  const userId = body.userId ?? "";
  if (!userId || userId === me.id)
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });
  if (body.block === false) {
    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, userId)));
    return NextResponse.json({ ok: true });
  }
  await db
    .insert(userBlocks)
    .values({ blockerId: me.id, blockedId: userId })
    .onConflictDoNothing();
  log.info("Пользователь заблокирован", { blocker: me.id, blocked: userId });
  return NextResponse.json({ ok: true });
});
