import { db } from "@/db";
import { userSettings, users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ensureSeed } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      handle: users.handle,
      emoji: users.emoji,
      accent: users.accent,
      about: users.about,
    })
    .from(users)
    .orderBy(users.id)
    .limit(20);
  return Response.json({ accounts: rows });
}

export async function POST(request: Request) {
  await ensureSeed();
  const payload = (await request.json().catch(() => ({}))) as {
    name?: string;
    emoji?: string;
    accent?: string;
    about?: string;
  };
  const name = (payload.name ?? "").trim();
  if (name.length < 2) return Response.json({ error: "name_too_short" }, { status: 400 });
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "")
    .slice(0, 12) || "user";
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(desc(users.id))
    .limit(1);
  const handle = `${base}${existing[0] ? existing[0].id + 1 : 1}`;
  const ins = await db
    .insert(users)
    .values({
      name,
      handle,
      emoji: payload.emoji ?? "⚡",
      accent: payload.accent ?? "violet",
      about: payload.about ?? "Новый участник Pulse",
    })
    .returning();
  await db.insert(userSettings).values({ userId: ins[0].id, accent: ins[0].accent });
  return Response.json({ user: { id: ins[0].id } });
}
