import { NextResponse } from "next/server";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";

/**
 * POST /api/reports — пожаловаться на сообщение.
 * GET  /api/reports — список жалоб (только администратор).
 */
export const POST = withApi("reports:create", async ({ req, me }) => {
  const body = await req.json().catch(() => ({}));
  const messageId = String(body.messageId ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 300);
  if (!isUuid(messageId)) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg || msg.deletedAt) return NextResponse.json({ error: "Сообщение не найдено" }, { status: 404 });
  await db.execute(
    sql`insert into reports (message_id, reporter_id, reason) values (${messageId}, ${me.id}, ${reason || "Без причины"})`,
  );
  return NextResponse.json({ ok: true });
});

export const GET = withApi("reports:list", async ({ me }) => {
  if (!me.isAdmin) return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });
  const rows = await db.execute(
    sql`select r.id, r.message_id as "messageId", r.reason, r.created_at as "createdAt",
               u.username as reporter, m.content as content
        from reports r
        join users u on u.id = r.reporter_id
        left join messages m on m.id = r.message_id
        order by r.created_at desc limit 100`,
  );
  return NextResponse.json({ reports: rows });
});
