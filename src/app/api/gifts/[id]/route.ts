import { NextResponse } from "next/server";
import { db } from "@/db";
import { gifts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * PATCH /api/gifts/:id — закрепить/открепить подарок в своей витрине.
 * Закрепляет только владелец (получатель); закреплённые показываются первыми.
 */
export const PATCH = withApi<{ id: string }>("gifts:pin", async ({ req, me, params }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Подарок не найден" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const pinned = body.pinned === true;

  const [row] = await db.select().from(gifts).where(eq(gifts.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Подарок не найден" }, { status: 404 });
  if (row.recipientId !== me.id)
    return NextResponse.json({ error: "Закрепляют только владельцы подарка" }, { status: 403 });

  await db.update(gifts).set({ pinned }).where(eq(gifts.id, id));
  return NextResponse.json({ ok: true, pinned });
});
