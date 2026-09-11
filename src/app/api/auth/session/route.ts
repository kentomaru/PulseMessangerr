import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, ensureSeed, touchPresence } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const store = await cookies();
  const id = Number(store.get(SESSION_COOKIE)?.value ?? 0);
  if (!Number.isFinite(id) || id <= 0) return Response.json({ user: null });
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return Response.json({ user: null });
  await touchPresence(id);
  return Response.json({
    user: {
      id: rows[0].id,
      name: rows[0].name,
      handle: rows[0].handle,
      emoji: rows[0].emoji,
      accent: rows[0].accent,
      about: rows[0].about,
    },
  });
}

export async function POST(request: Request) {
  await ensureSeed();
  const payload = (await request.json().catch(() => ({}))) as { userId?: number };
  const id = Number(payload.userId);
  if (!Number.isFinite(id)) return Response.json({ error: "bad_request" }, { status: 400 });
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (rows.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  const store = await cookies();
  store.set(SESSION_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  await touchPresence(id);
  return Response.json({ ok: true, userId: id });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
