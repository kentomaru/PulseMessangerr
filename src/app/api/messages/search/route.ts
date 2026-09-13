import { NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { conversationMembers, conversations, messages, users } from "@/db/schema";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";

/**
 * Глобальный поиск по сообщениям во всех моих чатах (как в Telegram).
 * GET /api/messages/search?q=...
 * Поддерживается фильтр по отправителю: "from:имя текст".
 * С параметром conversationId ищет только в этом чате.
 */
export const GET = withApi("messages:search", async ({ req, me }) => {
  const rawQ = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";

  // «from:вася привет» — сообщения васи, содержащие «привет»
  const fromMatch = rawQ.match(/^from:(\S+)\s*(.*)$/i);
  const fromName = fromMatch ? fromMatch[1].replace(/^@/, "") : null;
  const q = (fromMatch ? fromMatch[2] : rawQ).trim();
  if (q.length < 2 && !fromName) return NextResponse.json({ results: [] });
  if (q.length < 1 && fromName) return NextResponse.json({ results: [] });

  // мои диалоги
  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));
  const convIds = [...new Set(myConvs.map((c) => c.conversationId))];
  if (convIds.length === 0) return NextResponse.json({ results: [] });

  const scopeIds =
    conversationId && isUuid(conversationId) && convIds.includes(conversationId)
      ? [conversationId]
      : convIds;

  // Фильтр по отправителю: находим пользователей по нику/юзернейму.
  // «from:me» / «from:я» — только мои собственные сообщения.
  let senderFilter: ReturnType<typeof inArray> | undefined;
  if (fromName) {
    const meAlias = ["me", "я", "я!"].includes(fromName.toLowerCase());
    if (meAlias) {
      senderFilter = inArray(messages.senderId, [me.id]);
    } else {
      const namePattern = `%${fromName.replace(/[%_\\]/g, "")}%`;
      const matched = await db
        .select({ id: users.id })
        .from(users)
        .where(or(ilike(users.username, namePattern), ilike(users.displayName, namePattern)));
      const senderIds = matched.map((u) => u.id);
      if (senderIds.length === 0) return NextResponse.json({ results: [] });
      senderFilter = inArray(messages.senderId, senderIds);
    }
  }

  // В коллации C кириллица не приводится к нижнему регистру —
  // ищем несколькими вариантами регистра (оригинал, с заглавной, КАПСОМ).
  const cleanedQ = q.replace(/[%_\\]/g, "");
  const variants = new Set<string>([cleanedQ]);
  if (cleanedQ.length > 0) {
    variants.add(cleanedQ[0].toUpperCase() + cleanedQ.slice(1));
    variants.add(cleanedQ.toUpperCase());
  }
  const patterns = [...variants].map((v) => `%${v}%`);
  const rows = await db
    .select({
      message: messages,
      conv: conversations,
      sender: users,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        inArray(messages.conversationId, scopeIds),
        isNull(messages.deletedAt),
        senderFilter,
        q.length >= 2
          ? or(...patterns.map((p) => ilike(messages.content, p)))
          : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(25);

  const results = rows.map(({ message, conv, sender }) => ({
    id: message.id,
    conversationId: message.conversationId,
    conversationName: conv.name,
    conversationKind: conv.kind,
    type: message.type,
    content: message.content,
    preview: message.content.slice(0, 160),
    snippet: message.content.slice(0, 160),
    senderId: message.senderId,
    senderName: sender.displayName,
    senderUsername: sender.username,
    sender: publicUser(sender),
    createdAt: new Date(message.createdAt).toISOString(),
  }));

  return NextResponse.json({ results });
});
