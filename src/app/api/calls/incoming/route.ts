import { NextResponse } from "next/server";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { expireIfStale, getCallCaller, serializeCall } from "@/lib/calls";

/**
 * GET /api/calls/incoming — входящие звонки (status = ringing) для меня.
 * Клиент опрашивает этот роут раз в 3 секунды. Заодно звонки, которые
 * никто не принял за 40 секунд, помечаются пропущенными.
 */
export const GET = withApi("calls:incoming", async ({ me }) => {
  const ringing = await db
    .select()
    .from(calls)
    .where(
      and(
        eq(calls.calleeId, me.id),
        eq(calls.status, "ringing"),
        gt(calls.createdAt, new Date(Date.now() - 60_000)),
      ),
    )
    .orderBy(desc(calls.createdAt))
    .limit(3);

  const result = [];
  for (const row of ringing) {
    const fresh = await expireIfStale(row);
    if (fresh.status !== "ringing") continue; // только что истёк — пропускаем
    const caller = await getCallCaller(fresh);
    result.push(serializeCall(fresh, caller));
  }

  return NextResponse.json({ calls: result });
});
