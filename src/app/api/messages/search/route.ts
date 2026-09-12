import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, messages, users } from "@/db/schema";
import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import { isUuid, withApi } from "@/lib/api-helpers";
import { messagePreview } from "@/lib/format";

/**
 * GET /api/messages/search?conversationId=…&q=… — поиск по сообщениям диалога.
 *
 * Ищем по подстроке в content (для вложений — по подписи и имени файла),
 * возвращаем до 50 результатов (свежие первыми) с готовым превью.
 */
export const GET = withApi("messages:search", async ({ req, me }) => {
  const conversationId = req.nextUrl.searchParams.get("conversationId") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!conversationId || !isUuid(conversationId))
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  if (q.length < 1) return NextResponse.json({ results: [] });

  const membership = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!membership[0]) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.deletedAt),
        ilike(messages.content, `%${q.replace(/[%_\\]/g, "")}%`),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  // Для вложений content — JSON: ищем совпадение только если оно в подписи/имени
  const filtered = rows.filter((m) => {
    if (m.type === "text" || m.type === "call") return m.type === "text";
    try {
      const parsed = JSON.parse(m.content) as Record<string, unknown>;
      const hay = [parsed.caption, parsed.name]
        .filter((v): v is string => typeof v === "string")
        .join(" ");
      return hay.toLowerCase().includes(q.toLowerCase());
    } catch {
      return false;
    }
  });

  const senderIds = Array.from(new Set(filtered.map((m) => m.senderId)));
  const senderRows = senderIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, senderIds))
    : [];
  const byId = new Map(senderRows.map((u) => [u.id, u]));

  return NextResponse.json({
    results: filtered.slice(0, 50).map((m) => {
      const sender = byId.get(m.senderId);
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        preview: messagePreview(m.type, m.content),
        createdAt: new Date(m.createdAt).toISOString(),
        senderId: m.senderId,
        senderName: sender?.displayName ?? "Пользователь",
        sender: sender ? publicUser(sender) : null,
      };
    }),
  });
});
