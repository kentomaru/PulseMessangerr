import { NextResponse } from "next/server";
import { db } from "@/db";
import { gifts, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { GIFTS, NFT_VARIANTS, GIFT_LIMIT } from "@/lib/gifts";

/** Кулдаун рулетки — 24 часа. Таймер хранится НА СЕРВЕРЕ (как у ГС):
 *  перезагрузка страницы его не сбрасывает. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Рулеточные NFT и их веса: чем дороже — тем реже. */
const WEIGHTS: Record<string, number> = {
  nft_whale: 30,
  nft_oni: 25,
  nft_pegasus: 20,
  nft_wolf: 12,
  nft_diamond: 9,
  nft_phoenix: 4,
};

const PRIZES = GIFTS.filter((g) => g.rouletteOnly);
const TOTAL_W = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

function prizeList() {
  return PRIZES.map((g) => ({
    key: g.key,
    name: g.name,
    img: g.img,
    price: g.price,
    chance: Math.round(((WEIGHTS[g.key] ?? 0) / TOTAL_W) * 1000) / 10,
  }));
}

/** GET /api/roulette — состояние таймера и призы. */
export const GET = withApi("roulette:state", async ({ me }) => {
  const [u] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  const last = (u as { rouletteAt?: Date | null } | undefined)?.rouletteAt ?? null;
  const readyAt = last ? new Date(last.getTime() + COOLDOWN_MS) : null;
  const now = Date.now();
  return NextResponse.json({
    available: !readyAt || readyAt.getTime() <= now,
    readyAt: readyAt ? readyAt.toISOString() : null,
    now: new Date(now).toISOString(),
    prizes: prizeList(),
  });
});

/** POST /api/roulette — спин. Не чаще раза в 24 часа (проверка на сервере). */
export const POST = withApi("roulette:spin", async ({ me }) => {
  const [u] = await db.select().from(users).where(eq(users.id, me.id)).limit(1);
  const last = (u as { rouletteAt?: Date | null } | undefined)?.rouletteAt ?? null;
  const now = Date.now();
  if (last && now - last.getTime() < COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: "Рулетка ещё перезаряжается",
        readyAt: new Date(last.getTime() + COOLDOWN_MS).toISOString(),
      },
      { status: 409 },
    );
  }

  // Полка подарков не резиновая: максимум 50 на аккаунт
  const [cnt] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gifts)
    .where(eq(gifts.recipientId, me.id));
  if ((cnt?.n ?? 0) >= GIFT_LIMIT)
    return NextResponse.json(
      { error: `Полка подарков заполнена — максимум ${GIFT_LIMIT} подарков` },
      { status: 409 },
    );

  // Взвешенный выбор приза
  let roll = Math.random() * TOTAL_W;
  let winner = PRIZES[0];
  for (const g of PRIZES) {
    roll -= WEIGHTS[g.key] ?? 0;
    if (roll <= 0) {
      winner = g;
      break;
    }
  }
  const variant = Math.floor(Math.random() * NFT_VARIANTS.length);

  const [row] = await db
    .insert(gifts)
    .values({
      senderId: me.id,
      recipientId: me.id,
      giftKey: winner.key,
      message: "Выигрыш в рулетке NFT",
      hideSender: false,
      variant,
      source: "roulette",
    })
    .returning();
  await db.update(users).set({ rouletteAt: new Date(now) }).where(eq(users.id, me.id));

  return NextResponse.json({
    ok: true,
    prize: {
      id: row.id,
      giftKey: winner.key,
      name: winner.name,
      img: winner.img,
      price: winner.price,
      edition: winner.edition,
      variant,
      variantName: NFT_VARIANTS[variant].name,
    },
    nextReadyAt: new Date(now + COOLDOWN_MS).toISOString(),
  });
});
