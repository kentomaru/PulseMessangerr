import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messageReactions, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/** Разрешённые эмодзи (белый список, чтобы в базу не летел мусор).
 *  Точно совпадает с QUICK_EMOJIS + EXTRA_REACTIONS на клиенте. */
const ALLOWED_EMOJI = new Set([
  // быстрые
  "👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "🤔", "👀", "💯",
  // дополнительные (кнопка «+»)
  "😀","😅","😊","😍","😘","😜","🤗","😎","🥳","😇",
  "🙃","😉","🤩","😐","😴","🤯","😱","😤","😭","🤡",
  "💀","👻","🤖","💩","❤️‍🔥","💔","💕","✨","⚡","🌟",
  "🍀","🌈","🎂","🍾","🏆","🎯","🚀","💎","🙏","👏",
  "🤝","💪","✌️","🤘","🫡","🤌","👎","🖕","🥱","😬",
]);

/**
 * POST /api/messages/[id]/reactions { emoji } — поставить/снять реакцию.
 * Повторный клик по той же реакции — снимает её (toggle, как в Discord).
 */
export const POST = withApi<{ id: string }>("messages:react", async ({ req, params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const emoji = typeof body.emoji === "string" ? body.emoji : "";
  if (!ALLOWED_EMOJI.has(emoji))
    return NextResponse.json({ error: "Недопустимая реакция" }, { status: 400 });

  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const msg = rows[0];
  if (!msg || msg.deletedAt)
    return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });

  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, msg.conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!membership[0]) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const existing = await db
    .select()
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, id),
        eq(messageReactions.userId, me.id),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, id),
          eq(messageReactions.userId, me.id),
          eq(messageReactions.emoji, emoji),
        ),
      );
  } else {
    await db.insert(messageReactions).values({ messageId: id, userId: me.id, emoji });
  }

  // возвращаем актуальную сводку реакций
  const all = await db.select().from(messageReactions).where(eq(messageReactions.messageId, id));
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of all) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === me.id) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  const reactions = Array.from(byEmoji.entries())
    .map(([e, { count, mine }]) => ({ emoji: e, count, mine }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ reactions, active: !existing[0] });
});
