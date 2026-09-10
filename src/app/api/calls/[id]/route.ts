import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversationMembers, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";
import { expireIfStale, insertCallLog } from "@/lib/calls";

async function loadForUser(callId: string, userId: string) {
  const rows = await db
    .select({ call: calls, caller: users })
    .from(calls)
    .innerJoin(users, eq(calls.callerId, users.id))
    .where(eq(calls.id, callId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const membership = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, row.call.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!membership[0]) return null;
  return row;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await ctx.params;

  const row = await loadForUser(id, me.id);
  if (!row) return NextResponse.json({ error: "Не найден" }, { status: 404 });

  const fresh = await expireIfStale(row.call);
  return NextResponse.json({
    call: { ...fresh, caller: publicUser(row.caller), selfId: me.id },
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const { id } = await ctx.params;

  const row = await loadForUser(id, me.id);
  if (!row) return NextResponse.json({ error: "Не найден" }, { status: 404 });
  const call = row.call;

  const body = await req.json();
  const action = String(body.action ?? "");
  const isCaller = call.callerId === me.id;

  if (action === "offer") {
    if (!isCaller || call.status !== "ringing")
      return NextResponse.json({ error: "Недопустимо" }, { status: 400 });
    await db
      .update(calls)
      .set({ offerSdp: String(body.sdp ?? "") })
      .where(eq(calls.id, id));
    return NextResponse.json({ ok: true });
  }

  if (action === "answer") {
    if (isCaller || call.status !== "ringing")
      return NextResponse.json({ error: "Недопустимо" }, { status: 400 });
    const [updated] = await db
      .update(calls)
      .set({
        answerSdp: String(body.sdp ?? ""),
        status: "active",
        answeredAt: new Date(),
      })
      .where(eq(calls.id, id))
      .returning();
    return NextResponse.json({ call: updated });
  }

  if (action === "decline") {
    if (isCaller || call.status !== "ringing")
      return NextResponse.json({ error: "Недопустимо" }, { status: 400 });
    const [updated] = await db
      .update(calls)
      .set({ status: "declined", endedAt: new Date() })
      .where(eq(calls.id, id))
      .returning();
    await insertCallLog(call, "declined", 0);
    return NextResponse.json({ call: updated });
  }

  if (action === "end") {
    if (call.status === "ended" || call.status === "declined" || call.status === "missed")
      return NextResponse.json({ call });
    const now = new Date();
    if (call.status === "ringing") {
      const status = isCaller ? "missed" : "declined";
      const [updated] = await db
        .update(calls)
        .set({ status, endedAt: now })
        .where(eq(calls.id, id))
        .returning();
      await insertCallLog(call, status, 0);
      return NextResponse.json({ call: updated });
    }
    const durationSec = call.answeredAt
      ? Math.max(0, Math.round((now.getTime() - new Date(call.answeredAt).getTime()) / 1000))
      : 0;
    const [updated] = await db
      .update(calls)
      .set({ status: "ended", endedAt: now })
      .where(eq(calls.id, id))
      .returning();
    await insertCallLog(call, "ended", durationSec);
    return NextResponse.json({ call: updated });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
