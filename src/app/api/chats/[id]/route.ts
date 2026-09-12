import { db } from "@/db";
import { blocks, chats, chatMembers, messages, users } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  assertMembership,
  deleteChatForEveryone,
  deleteChatForUser,
  getSessionUser,
} from "@/lib/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function resolve(context: Ctx) {
  const { id } = await context.params;
  const chatId = Number(id);
  const me = await getSessionUser();
  if (!me || !Number.isFinite(chatId)) return null;
  const member = await assertMembership(chatId, me.id);
  if (!member) return null;
  return { chatId, me };
}

export async function GET(_request: Request, context: Ctx) {
  const ctx = await resolve(context);
  if (!ctx) return Response.json({ error: "not_found" }, { status: 404 });
  const { chatId, me } = ctx;

  const chatRows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  if (chatRows.length === 0) return Response.json({ error: "not_found" }, { status: 404 });
  const chat = chatRows[0];

  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      handle: users.handle,
      emoji: users.emoji,
      accent: users.accent,
      avatarFileId: users.avatarFileId,
      lastSeenAt: users.lastSeenAt,
      role: chatMembers.role,
      lastReadMessageId: chatMembers.lastReadMessageId,
    })
    .from(chatMembers)
    .innerJoin(users, eq(users.id, chatMembers.userId))
    .where(eq(chatMembers.chatId, chatId))
    .orderBy(asc(chatMembers.id));

  const mine = await db
    .select()
    .from(chatMembers)
    .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)))
    .limit(1);

  let blockState = { blocked: false, blockedBy: false };
  const partner = memberRows.find((m) => m.userId !== me.id);
  if (partner) {
    const rows = await db
      .select()
      .from(blocks)
      .where(
        sql`(${blocks.blockerId} = ${me.id} and ${blocks.blockedId} = ${partner.userId}) or (${blocks.blockerId} = ${partner.userId} and ${blocks.blockedId} = ${me.id})`,
      );
    blockState = {
      blocked: rows.some((r) => r.blockerId === me.id),
      blockedBy: rows.some((r) => r.blockedId === me.id),
    };
  }

  return Response.json({
    chat: {
      id: chat.id,
      kind: chat.kind,
      title: chat.title ?? "",
      emoji: chat.emoji,
      accent: chat.accent,
      avatarFileId: chat.avatarFileId,
      wallpaper: chat.wallpaper,
      ownerId: chat.ownerId,
    },
    me: { ...mine[0], id: me.id, name: me.name },
    members: memberRows.map((m) => ({ ...m, lastSeenAt: m.lastSeenAt.toISOString() })),
    blockState,
  });
}

export async function PATCH(request: Request, context: Ctx) {
  const ctx = await resolve(context);
  if (!ctx) return Response.json({ error: "not_found" }, { status: 404 });
  const { chatId, me } = ctx;
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const chatPatch: Record<string, unknown> = {};
  if (typeof payload.title === "string") chatPatch.title = payload.title.slice(0, 80);
  if (typeof payload.emoji === "string") chatPatch.emoji = payload.emoji.slice(0, 8);
  if (typeof payload.accent === "string") chatPatch.accent = payload.accent;
  if ("wallpaper" in payload) {
    chatPatch.wallpaper = payload.wallpaper === null ? null : String(payload.wallpaper);
  }
  if (payload.avatarFileId !== undefined) {
    chatPatch.avatarFileId =
      payload.avatarFileId === null ? null : Number(payload.avatarFileId);
  }
  if (Object.keys(chatPatch).length > 0) {
    await db.update(chats).set(chatPatch).where(eq(chats.id, chatId));
  }

  const memberPatch: Record<string, unknown> = {};
  if (typeof payload.muted === "boolean") memberPatch.muted = payload.muted;
  if (typeof payload.pinned === "boolean") memberPatch.pinned = payload.pinned;
  if (typeof payload.archived === "boolean") memberPatch.archived = payload.archived;
  if ("personalWallpaper" in payload) {
    memberPatch.wallpaper =
      payload.personalWallpaper === null ? null : String(payload.personalWallpaper);
  }
  if (Object.keys(memberPatch).length > 0) {
    await db
      .update(chatMembers)
      .set(memberPatch)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, me.id)));
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: Ctx) {
  const ctx = await resolve(context);
  if (!ctx) return Response.json({ error: "not_found" }, { status: 404 });
  const { chatId, me } = ctx;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "me";

  if (scope === "all") {
    const chatRows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    const chat = chatRows[0];
    if (chat && chat.kind === "direct") {
      await deleteChatForEveryone(chatId);
      return Response.json({ ok: true, scope: "all" });
    }
    if (chat && chat.ownerId !== me.id) {
      return Response.json({ error: "not_owner" }, { status: 403 });
    }
    await deleteChatForEveryone(chatId);
    return Response.json({ ok: true, scope: "all" });
  }

  await deleteChatForUser(chatId, me.id);
  return Response.json({ ok: true, scope: "me" });
}
