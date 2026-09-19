import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { and, eq, ilike, isNull, not, or } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * Админка для чатов и каналов.
 *  GET  /api/admin/conversations?q=… — поиск групп/каналов.
 *  POST { conversationId, mode: "ban" | "unban" | "delete", reason }
 */
export const GET = withApi("admin/conversations:list", async ({ req, me }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        not(eq(conversations.kind, "direct")),
        q ? ilike(conversations.name, `%${q}%`) : undefined,
      ),
    )
    .orderBy(conversations.createdAt)
    .limit(50);
  return NextResponse.json({
    conversations: rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name ?? "",
      avatarUrl: c.avatarUrl,
      bannedAt: c.bannedAt ? new Date(c.bannedAt).toISOString() : null,
      banReason: c.banReason ?? null,
      createdAt: new Date(c.createdAt).toISOString(),
    })),
  });
});

export const POST = withApi("admin/conversations:act", async ({ req, me, log }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId ?? "");
  const mode = String(body.mode ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 200);
  if (!isUuid(conversationId)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  if (!["ban", "unban", "delete"].includes(mode))
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!conv || conv.kind === "direct")
    return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  if (mode === "unban") {
    await db
      .update(conversations)
      .set({ bannedAt: null, banReason: null })
      .where(eq(conversations.id, conversationId));
    log.info("Админ разблокировал чат", { by: me.username, conv: conv.name });
    return NextResponse.json({ ok: true });
  }
  if (mode === "delete") {
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    log.info("Админ удалил чат", { by: me.username, conv: conv.name });
    return NextResponse.json({ ok: true });
  }
  await db
    .update(conversations)
    .set({ bannedAt: new Date(), banReason: reason || "Нарушение правил сервиса" })
    .where(eq(conversations.id, conversationId));
  log.info("Админ заблокировал чат", { by: me.username, conv: conv.name, reason });
  return NextResponse.json({ ok: true });
});
