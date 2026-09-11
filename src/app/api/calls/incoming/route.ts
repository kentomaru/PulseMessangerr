import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, chatMembers, users } from "@/db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getSessionUser } from "@/lib/server";
import { callPeerFrom, expireIfStale } from "@/lib/calls-server";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const myChats = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .where(eq(chatMembers.userId, me.id));

  if (myChats.length === 0) return NextResponse.json({ call: null });
  const ids = myChats.map((c) => c.chatId);

  const ringing = await db
    .select({ call: calls, caller: users })
    .from(calls)
    .innerJoin(users, eq(calls.callerId, users.id))
    .where(
      and(
        inArray(calls.chatId, ids),
        eq(calls.status, "ringing"),
        ne(calls.callerId, me.id),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(5);

  for (const row of ringing) {
    const fresh = await expireIfStale(row.call);
    if (fresh.status === "ringing") {
      return NextResponse.json({
        call: { ...fresh, caller: callPeerFrom(row.caller) },
      });
    }
  }
  return NextResponse.json({ call: null });
}
