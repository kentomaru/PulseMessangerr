import { db } from "@/db";
import { chats, chatMembers, messages, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { findDirectChat, getSessionUser, loadChats, touchPresence } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  await touchPresence(me.id);
  const list = await loadChats(me.id);
  return Response.json({ chats: list });
}

export async function POST(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = (await request.json().catch(() => ({}))) as {
    kind?: "direct" | "group";
    userId?: number;
    title?: string;
    emoji?: string;
    memberIds?: number[];
  };

  if (payload.kind === "group") {
    const title = (payload.title ?? "").trim();
    if (title.length < 1) return Response.json({ error: "title_required" }, { status: 400 });
    const ins = await db
      .insert(chats)
      .values({
        kind: "group",
        title,
        emoji: payload.emoji ?? "⚡",
        accent: "violet",
        ownerId: me.id,
      })
      .returning();
    const chat = ins[0];
    const memberIds = Array.from(new Set([me.id, ...(payload.memberIds ?? [])]));
    await db.insert(chatMembers).values(
      memberIds.map((id) => ({
        chatId: chat.id,
        userId: id,
        role: id === me.id ? "owner" : "member",
      })),
    );
    await db.insert(messages).values({
      chatId: chat.id,
      senderId: me.id,
      kind: "system",
      body: `Группа «${title}» создана`,
    });
    return Response.json({ chatId: chat.id });
  }

  const otherId = Number(payload.userId);
  if (!Number.isFinite(otherId) || otherId === me.id) {
    return Response.json({ error: "bad_user" }, { status: 400 });
  }
  const existing = await findDirectChat(me.id, otherId);
  if (existing) return Response.json({ chatId: existing, existing: true });

  const ins = await db.insert(chats).values({ kind: "direct", accent: "violet" }).returning();
  const chat = ins[0];
  await db.insert(chatMembers).values([
    { chatId: chat.id, userId: me.id },
    { chatId: chat.id, userId: otherId },
  ]);
  return Response.json({ chatId: chat.id });
}
