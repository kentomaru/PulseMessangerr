import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, conversations } from "@/db/schema";
import { and, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { withApi } from "@/lib/api-helpers";
import { normalizeKind } from "@/lib/conversations";
import type { DiscoverItem } from "@/lib/types";

/**
 * GET /api/discover?q=... — публичные группы и каналы (как «Обзор» в Discord).
 * Приватные сюда не попадают: в них заходят только по ссылке-приглашению.
 */
export const GET = withApi("discover", async ({ req, me }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const pattern = `%${q.replace(/[%_\\]/g, "")}%`;

  const rows = await db
    .select({
      conv: conversations,
      n: sql<number>`(select count(*)::int from conversation_members m where m.conversation_id = ${conversations.id})`,
    })
    .from(conversations)
    .where(
      and(
        ne(conversations.kind, "direct"),
        eq(conversations.isPrivate, false),
        q.length > 0 ? or(ilike(conversations.name, pattern), ilike(conversations.about, pattern)) : sql`true`,
      ),
    )
    .orderBy(sql`${conversations.createdAt} desc`)
    .limit(24);

  const myRows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(
      rows.length > 0
        ? and(
            eq(conversationMembers.userId, me.id),
            inArray(conversationMembers.conversationId, rows.map((r) => r.conv.id)),
          )
        : eq(conversationMembers.userId, me.id),
    );
  const joined = new Set(myRows.map((r) => r.conversationId));

  const items: DiscoverItem[] = rows.map((r) => ({
    id: r.conv.id,
    kind: normalizeKind(r.conv.kind),
    name: r.conv.name ?? "",
    avatarUrl: r.conv.avatarUrl,
    about: r.conv.about ?? "",
    memberCount: Number(r.n ?? 0),
    isPrivate: !!r.conv.isPrivate,
    joined: joined.has(r.conv.id),
  }));

  return NextResponse.json({ items });
});
