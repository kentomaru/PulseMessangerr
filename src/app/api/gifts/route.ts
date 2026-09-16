import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations, gifts, messages, users } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";
import { GIFTS } from "@/lib/gifts";
import { newInviteToken } from "@/lib/conversations";

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
    .orderBy(desc(gifts.pinned), desc(gifts.createdAt))
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
        pinned: !!(r as { pinned?: boolean }).pinned,
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
  /* Себе дарить можно — подарок попадёт в собственную витрину. */
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

  // Как в ТГ: подарок приходит сообщением в личный чат с получателем.
  // Ищем существующий диалог; нет — создаём.
  try {
    const rows =
      me.id === recipientId
        ? []
        : await db
      .select({
        convId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        kind: conversations.kind,
      })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(and(inArray(conversationMembers.userId, [me.id, recipientId]), eq(conversations.kind, "direct")));
    const byConv = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = byConv.get(r.convId) ?? new Set<string>();
      set.add(r.userId);
      byConv.set(r.convId, set);
    }
    let dmId: string | null = null;
    for (const [cid, members] of byConv) {
      if (members.has(me.id) && members.has(recipientId)) {
        dmId = cid;
        break;
      }
    }
    if (!dmId) {
      const [conv] = await db
        .insert(conversations)
        .values({ kind: "direct", isGroup: false, isPrivate: true, ownerId: me.id, inviteToken: newInviteToken() })
        .returning();
      await db.insert(conversationMembers).values([
        { conversationId: conv.id, userId: me.id, role: "owner" },
        { conversationId: conv.id, userId: recipientId, role: "member" },
      ]);
      dmId = conv.id;
    }
    await db.insert(messages).values({
      conversationId: dmId,
      senderId: me.id,
      type: "gift",
      content: JSON.stringify({ giftKey: gift.key, note: message || "", anonymous: hideSender }),
    });
  } catch {
    /* подарок сохранён в профиле — сообщение в чате не критично */
  }

  return NextResponse.json({ ok: true, gift: gift.key, recipient: publicUser(recipient) });
});
