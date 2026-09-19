import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { friendRequests, users } from "@/db/schema";
import { publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";

/**
 * Друзья как в Discord: заявки, принятие, отклонение, список.
 * GET  — { friends, incoming, outgoing }
 * POST — { userId, action: "request" | "accept" | "decline" | "remove" }
 */
export const GET = withApi("friends", async ({ me }) => {
  const rows = await db
    .select()
    .from(friendRequests)
    .where(or(eq(friendRequests.fromId, me.id), eq(friendRequests.toId, me.id)));

  const ids = new Set<string>();
  rows.forEach((r) => {
    if (r.status === "accepted") {
      ids.add(r.fromId);
      ids.add(r.toId);
    }
  });
  ids.delete(me.id);

  const incomingRows = rows.filter((r) => r.toId === me.id && r.status === "pending");
  const outgoingRows = rows.filter((r) => r.fromId === me.id && r.status === "pending");
  const allIds = [...ids, ...incomingRows.map((r) => r.fromId), ...outgoingRows.map((r) => r.toId)];

  const people = allIds.length
    ? await db.select().from(users).where(
        or(...allIds.map((id) => eq(users.id, id))),
      )
    : [];
  const byId = new Map(people.map((u) => [u.id, u]));

  return NextResponse.json({
    friends: [...ids].map((id) => byId.get(id)).filter(Boolean).map((u) => publicUser(u!)),
    incoming: incomingRows
      .map((r) => byId.get(r.fromId))
      .filter(Boolean)
      .map((u) => publicUser(u!)),
    outgoing: outgoingRows
      .map((r) => byId.get(r.toId))
      .filter(Boolean)
      .map((u) => publicUser(u!)),
  });
});

export const POST = withApi("friends", async ({ req, me, log }) => {
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    action?: string;
  };
  const userId = body.userId ?? "";
  if (!userId || userId === me.id)
    return NextResponse.json({ error: "Некорректный пользователь" }, { status: 400 });
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });

  const action = body.action ?? "request";

  if (action === "remove") {
    await db
      .delete(friendRequests)
      .where(
        or(
          and(eq(friendRequests.fromId, me.id), eq(friendRequests.toId, userId)),
          and(eq(friendRequests.fromId, userId), eq(friendRequests.toId, me.id)),
        ),
      );
    return NextResponse.json({ ok: true });
  }

  if (action === "accept" || action === "decline") {
    const status = action === "accept" ? "accepted" : "declined";
    await db
      .update(friendRequests)
      .set({ status })
      .where(and(eq(friendRequests.fromId, userId), eq(friendRequests.toId, me.id)));
    log.info("Заявка в друзья обработана", { from: userId, to: me.id, status });
    return NextResponse.json({ ok: true });
  }

  // request: если встречная заявка — сразу принимаем
  const [counter] = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.fromId, userId), eq(friendRequests.toId, me.id)))
    .limit(1);
  if (counter) {
    await db
      .update(friendRequests)
      .set({ status: "accepted" })
      .where(and(eq(friendRequests.fromId, userId), eq(friendRequests.toId, me.id)));
    return NextResponse.json({ ok: true, accepted: true });
  }
  await db
    .insert(friendRequests)
    .values({ fromId: me.id, toId: userId, status: "pending" })
    .onConflictDoUpdate({
      target: [friendRequests.fromId, friendRequests.toId],
      set: { status: "pending" },
    });
  log.info("Заявка в друзья отправлена", { from: me.id, to: userId });
  return NextResponse.json({ ok: true });
});
