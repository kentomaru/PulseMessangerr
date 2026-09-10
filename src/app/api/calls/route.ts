import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { insertCallLog } from "@/lib/calls";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json();
  const conversationId = String(body.conversationId ?? "");

  const membership = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, me.id),
      ),
    )
    .limit(1);
  if (!membership[0])
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  // close any stale ringing calls started by me in this chat
  const stale = await db
    .select()
    .from(calls)
    .where(and(eq(calls.conversationId, conversationId), eq(calls.status, "ringing")));
  for (const c of stale) {
    await db
      .update(calls)
      .set({ status: "missed", endedAt: new Date() })
      .where(eq(calls.id, c.id));
    await insertCallLog(c, "missed", 0);
  }

  const [call] = await db
    .insert(calls)
    .values({ conversationId, callerId: me.id, status: "ringing" })
    .returning();

  return NextResponse.json({ call });
}
