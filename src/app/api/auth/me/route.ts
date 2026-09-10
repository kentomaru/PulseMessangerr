import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  return NextResponse.json({ user: publicUser(user) });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json();
  const patch: Partial<typeof users.$inferInsert> = {};

  if (typeof body.displayName === "string") {
    const dn = body.displayName.trim().slice(0, 64);
    if (dn.length < 1)
      return NextResponse.json({ error: "Имя не может быть пустым" }, { status: 400 });
    patch.displayName = dn;
  }
  if (typeof body.bio === "string") patch.bio = body.bio.trim().slice(0, 280);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null)
    patch.avatarUrl = body.avatarUrl || null;
  if (typeof body.bannerUrl === "string" || body.bannerUrl === null)
    patch.bannerUrl = body.bannerUrl || null;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, user.id))
    .returning();

  return NextResponse.json({ user: publicUser(updated) });
}
