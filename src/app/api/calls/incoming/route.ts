import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls, conversationMembers, users } from "@/db/schema";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getSessionUser, publicUser } from "@/lib/auth";
import { expireIfStale } from "@/lib/calls";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const myConvs = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, me.id));

  if (myConvs.length === 0) return NextResponse.json({ call: null });
  const ids = myConvs.map((c) => c.conversationId);

  const ringing = await db
    .select({ call: calls, caller: users })
    .from(calls)
    .innerJoin(users, eq(calls.callerId, users.id))
    .where(
      and(
        inArray(calls.conversationId, ids),
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
        call: { ...fresh, caller: publicUser(row.caller) },
      });
    }
  }
  return NextResponse.json({ call: null });
}
