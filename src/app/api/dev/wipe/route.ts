import { NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * ВРЕМЕННЫЙ эндпоинт полного сброса базы (по просьбе владельца).
 * POST /api/dev/wipe  с телом {"confirm":"WIPE_ALL"}
 *
 * Стирает ВСЁ: пользователей, сессии, сообщения, фото/баннеры, подарки,
 * опросы, истории — все таблицы. Схема остаётся, сервер продолжает
 * работать, после сброса все выходят из аккаунтов.
 *
 * Как только сброс выполнен — эндпоинт удаляется из кода следующим коммитом.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if ((body as { confirm?: string }).confirm !== "WIPE_ALL") {
    return NextResponse.json(
      { error: "Нужно подтвердить: передай {\"confirm\":\"WIPE_ALL\"}" },
      { status: 400 },
    );
  }
  await db.execute(sql`
    truncate table
      sessions,
      poll_votes,
      gifts,
      message_reactions,
      messages,
      story_views,
      stories,
      call_invites,
      call_signals,
      call_participants,
      calls,
      friend_requests,
      user_blocks,
      conversation_members,
      conversations,
      files,
      users
    restart identity cascade
  `);
  return NextResponse.json({ ok: true, wiped: "все таблицы пусты" });
}
