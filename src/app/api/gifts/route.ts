import { NextResponse } from "next/server";
import { db } from "@/db";
import { gifts, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";
import { GIFTS } from "@/lib/gifts";

/**
 * GET /api/gifts?userId=<id> — подарки пользователя (для его профиля).
 */
export const GET = withApi("gifts:list", async ({ req, me }) => {
  const userId = req.nextUrl.searchParams.get("userId") ?? "";
  if (!isUuid(userId)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const rows = await db
    .select()
    .from(gifts)
    .where(eq(gifts.recipientId, userId))
    .orderBy(desc(gifts.createdAt))
    .limit(50);
  const senderIds = Array.from(new Set(rows.map((r) => r.senderId).filter((v): v is string => !!v)));
  const senders = new Map<string, (typeof users.$inferSelect)>();
  for (const id of senderIds) {
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (u) senders.set(id, u);
  }
  return NextResponse.json({
    gifts: rows.map((r) => {
      const s = r.senderId ? senders.get(r.senderId) : undefined;
      // Как в ТГ: имя скрыто для всех, КРОМЕ самого получателя
      const hidden = !!(r as { hideSender?: boolean }).hideSender;
      const visible = hidden && me.id !== userId ? undefined : s;
      return {
        id: r.id,
        giftKey: r.giftKey,
        message: r.message,
        createdAt: new Date(r.createdAt).toISOString(),
        anonymous: hidden,
        sender: visible
          ? { id: visible.id, displayName: visible.displayName, username: visible.username, avatarUrl: visible.avatarUrl }
          : null,
      };
    }),
  });
});

/**
 * POST /api/gifts — подарить: { recipientId, giftKey, message? }.
 * Дарить может только Premium (звёзды у премиума бесконечные, как в ТГ).
 */
export const POST = withApi("gifts:send", async ({ req, me }) => {
  const body = await req.json().catch(() => ({}));
  const recipientId = String(body.recipientId ?? "");
  const giftKey = String(body.giftKey ?? "");
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 140) : "";
  const hideSender = body.hideSender === true;
  if (!isUuid(recipientId)) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (recipientId === me.id)
    return NextResponse.json({ error: "Себе подарки дарить нельзя" }, { status: 400 });
  const gift = GIFTS.find((g) => g.key === giftKey);
  if (!gift) return NextResponse.json({ error: "Такого подарка нет" }, { status: 400 });

  const [meRow] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  if (!meRow || !(meRow as { premium?: boolean }).premium)
    return NextResponse.json({ error: "Подарки дарят участники с Pulse Premium" }, { status: 403 });
  const [recipient] = await db.select().from(users).where(eq(users.id, recipientId)).limit(1);
  if (!recipient) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  await db.insert(gifts).values({
    senderId: me.id,
    recipientId,
    giftKey,
    message: message || null,
    hideSender,
  });
  return NextResponse.json({ ok: true, gift: gift.key, recipient: publicUser(recipient) });
});
