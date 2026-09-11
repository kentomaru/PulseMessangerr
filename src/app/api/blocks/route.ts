import { db } from "@/db";
import { blocks, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      handle: users.handle,
      emoji: users.emoji,
      accent: users.accent,
      avatarFileId: users.avatarFileId,
      createdAt: blocks.createdAt,
    })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(eq(blocks.blockerId, me.id));
  return Response.json({
    blocked: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const payload = (await request.json().catch(() => ({}))) as { userId?: number };
  const target = Number(payload.userId);
  if (!Number.isFinite(target) || target === me.id) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  await db.insert(blocks).values({ blockerId: me.id, blockedId: target }).onConflictDoNothing();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const target = Number(url.searchParams.get("userId"));
  if (!Number.isFinite(target)) return Response.json({ error: "bad_request" }, { status: 400 });
  await db
    .delete(blocks)
    .where(and(eq(blocks.blockerId, me.id), eq(blocks.blockedId, target)));
  return Response.json({ ok: true });
}
