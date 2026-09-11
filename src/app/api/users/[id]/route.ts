import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";

export const GET = withApi<{ id: string }>("users:get", async ({ params }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  return NextResponse.json({ user: publicUser(rows[0]) });
});
