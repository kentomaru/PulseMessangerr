import { NextResponse } from "next/server";
import { and, eq , like } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages } from "@/db/schema";
import { count } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { DISCUSSION_MARKER } from "@/lib/conversations";

/**
 * Комментарии канала = привязанная группа-обсуждение (как в Telegram).
 * Связь храним маркером в about группы — без новых колонок в БД.
 *
 * GET  — текущая привязка + список моих групп (для выбора в настройках).
 * POST { groupId }        — привязать группу (владелец канала и группы).
 * POST { unlink: true }   — отвязать обсуждение.
 * POST { join: true, groupId } — вступить в обсуждение (для участников канала).
 */

async function memberRole(conversationId: string, userId: string) {
  const [m] = await db
    .select({ role: conversationMembers.role })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return m?.role ?? null;
}

export const GET = withApi<{ id: string }>("conversations/:id/discussion", async ({ params, me }) => {
  const { id } = params;
  const [channel] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!channel || channel.kind !== "channel")
    return NextResponse.json({ error: "Не канал" }, { status: 404 });

  const [disc] = await db
    .select({ id: conversations.id, name: conversations.name, avatarUrl: conversations.avatarUrl })
    .from(conversations)
    .where(like(conversations.about, DISCUSSION_MARKER + id + "%"))
    .limit(1);

  // Сколько комментариев в обсуждении — всего и по каждому посту
  let discCount = 0;
  const postCounts: Record<string, number> = {};
  if (disc) {
    const [c] = await db
      .select({ n: count() })
      .from(messages)
      .where(eq(messages.conversationId, disc.id));
    discCount = c?.n ?? 0;
    // комментарии привязаны к посту через replyToId — считаем по постам
    const rows = await db
      .select({ replyToId: messages.replyToId })
      .from(messages)
      .where(eq(messages.conversationId, disc.id));
    for (const r of rows) {
      if (r.replyToId) postCounts[r.replyToId] = (postCounts[r.replyToId] ?? 0) + 1;
    }
  }

  // Мои группы, которыми владею — из них выбираем чат для комментариев
  const myGroups = await db
    .select({
      id: conversations.id,
      name: conversations.name,
      avatarUrl: conversations.avatarUrl,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, me.id),
        eq(conversationMembers.role, "owner"),
        eq(conversations.kind, "group"),
      ),
    );

  return NextResponse.json({ discussion: disc ?? null, myGroups, count: discCount, postCounts });
});

export const POST = withApi<{ id: string }>("conversations/:id/discussion", async ({ req, params, me }) => {
  const { id } = params;
  const body = (await req.json().catch(() => ({}))) as {
    groupId?: string;
    unlink?: boolean;
    join?: boolean;
  };

  const [channel] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!channel || channel.kind !== "channel")
    return NextResponse.json({ error: "Не канал" }, { status: 404 });

  const myChannelRole = await memberRole(id, me.id);

  // Вступление участника канала в обсуждение — чтобы мог комментировать
  if (body.join && body.groupId) {
    if (!myChannelRole)
      return NextResponse.json({ error: "Вы не участник канала" }, { status: 403 });
    const [g] = await db
      .select({ id: conversations.id, about: conversations.about, kind: conversations.kind })
      .from(conversations)
      .where(eq(conversations.id, body.groupId))
      .limit(1);
    if (!g || g.kind !== "group" || !(g.about ?? "").startsWith(DISCUSSION_MARKER + id))
      return NextResponse.json({ error: "Это не обсуждение канала" }, { status: 404 });
    await db
      .insert(conversationMembers)
      .values({ conversationId: g.id, userId: me.id, role: "member" })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  if (myChannelRole !== "owner")
    return NextResponse.json({ error: "Нужны права владельца канала" }, { status: 403 });

  // Отвязать обсуждение
  if (body.unlink) {
    const linked = await db
      .select({ id: conversations.id, about: conversations.about })
      .from(conversations)
      .where(like(conversations.about, DISCUSSION_MARKER + id + "%"));
    for (const row of linked) {
      // маркер — первая строка; всё, что после неё, — описание группы
      const rest = (row.about ?? "").slice((DISCUSSION_MARKER + id).length).replace(/^\n/, "");
      await db.update(conversations).set({ about: rest }).where(eq(conversations.id, row.id));
    }
    return NextResponse.json({ ok: true });
  }

  // Привязать группу
  if (body.groupId) {
    const [g] = await db
      .select({ id: conversations.id, about: conversations.about, kind: conversations.kind })
      .from(conversations)
      .where(eq(conversations.id, body.groupId))
      .limit(1);
    if (!g || g.kind !== "group")
      return NextResponse.json({ error: "Это не группа" }, { status: 404 });
    const gRole = await memberRole(g.id, me.id);
    if (gRole !== "owner")
      return NextResponse.json({ error: "Вы не владелец этой группы" }, { status: 403 });
    if (g.about && g.about.startsWith(DISCUSSION_MARKER) && g.about !== DISCUSSION_MARKER + id)
      return NextResponse.json(
        { error: "Группа уже является обсуждением другого канала" },
        { status: 409 },
      );
    const prev = (g.about ?? "").startsWith(DISCUSSION_MARKER)
      ? ""
      : (g.about ?? "").trim();
    await db
      .update(conversations)
      .set({ about: DISCUSSION_MARKER + id + (prev ? "\n" + prev : "") })
      .where(eq(conversations.id, g.id));
    // Владелец канала — в обсуждение сразу
    await db
      .insert(conversationMembers)
      .values({ conversationId: g.id, userId: me.id, role: "owner" })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Непонятное действие" }, { status: 400 });
});
