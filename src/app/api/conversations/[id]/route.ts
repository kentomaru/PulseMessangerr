import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, conversationMembers, conversations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import {
  isManager,
  listMembers,
  normalizeKind,
  normalizeRole,
  requireMember,
  serializeConversation,
} from "@/lib/conversations";
import { findActiveCall } from "@/lib/calls";

/**
 * GET /api/conversations/[id] — карточка диалога:
 * участники с ролями, мои права и живой звонок (если есть).
 */
export const GET = withApi<{ id: string }>("conversations:get", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const members = await listMembers(id);
  const info = await serializeConversation(access.conversation, me.id, { members });

  const active = await findActiveCall(id);
  let activeCall = null;
  if (active) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(callParticipants)
      .where(eq(callParticipants.callId, active.id));
    activeCall = {
      id: active.id,
      media: active.media === "video" ? ("video" as const) : ("audio" as const),
      status: active.status as "ringing" | "live",
      participantCount: Number(n),
      hostId: active.hostId,
      joinToken: active.joinToken,
      startedAt: new Date(active.startedAt).toISOString(),
    };
  }

  return NextResponse.json({ conversation: info, activeCall });
});

/**
 * PATCH /api/conversations/[id] — настройки группы/канала (только owner/admin):
 * name, about, avatarUrl, isPrivate, kind (группа ↔ канал).
 */
export const PATCH = withApi<{ id: string }>("conversations:update", async ({ req, params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (normalizeKind(access.conversation.kind) === "direct")
    return NextResponse.json({ error: "Это личный чат" }, { status: 400 });
  if (!isManager(access.membership.role))
    return NextResponse.json({ error: "Нужны права администратора" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof conversations.$inferInsert> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (name.length < 2)
      return NextResponse.json({ error: "Название должно быть не короче 2 символов" }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.about === "string") patch.about = body.about.trim().slice(0, 280);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null)
    patch.avatarUrl = body.avatarUrl && String(body.avatarUrl).startsWith("/api/files/") ? body.avatarUrl : null;
  if (typeof body.isPrivate === "boolean") patch.isPrivate = body.isPrivate;
  if (body.kind === "group" || body.kind === "channel") {
    patch.kind = body.kind;
    patch.isGroup = body.kind === "group";
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  const [updated] = await db.update(conversations).set(patch).where(eq(conversations.id, id)).returning();
  log.info("Диалог обновлён", { conversationId: id, fields: Object.keys(patch).join(",") });

  const members = await listMembers(id);
  return NextResponse.json({ conversation: await serializeConversation(updated, me.id, { members }) });
});

/**
 * DELETE /api/conversations/[id] — выйти из группы/канала (владелец — удалить).
 * Личный чат удалить нельзя: он просто остаётся в списке.
 */
export const DELETE = withApi<{ id: string }>("conversations:leave", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const conv = access.conversation;
  if (normalizeKind(conv.kind) === "direct")
    return NextResponse.json({ error: "Личный чат нельзя удалить" }, { status: 400 });

  const isOwner = conv.ownerId === me.id || normalizeRole(access.membership.role) === "owner";

  // Я в звонке этого диалога — выходим из комнаты
  const active = await findActiveCall(id);
  if (active) {
    const inCall = await db
      .select()
      .from(callParticipants)
      .where(and(eq(callParticipants.callId, active.id), eq(callParticipants.userId, me.id)))
      .limit(1);
    if (inCall[0]) {
      await db
        .delete(callParticipants)
        .where(and(eq(callParticipants.callId, active.id), eq(callParticipants.userId, me.id)));
    }
  }

  if (!isOwner) {
    await db
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)));
    log.info("Участник покинул диалог", { conversationId: id, userId: me.id });
    return NextResponse.json({ ok: true, left: true });
  }

  // Владелец удаляет группу/канал целиком
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, id));

  if (Number(n) > 1) {
    // передаём владение самому раннему участнику, чтобы не рушить чужой чат
    const members = await listMembers(id);
    const next = members.find((m) => m.user.id !== me.id);
    if (next) {
      await db
        .update(conversations)
        .set({ ownerId: next.user.id })
        .where(eq(conversations.id, id));
      await db
        .update(conversationMembers)
        .set({ role: "owner" })
        .where(
          and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, next.user.id)),
        );
      await db
        .delete(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)));
      log.info("Владелец покинул диалог, владение передано", {
        conversationId: id,
        newOwner: next.user.username,
      });
      return NextResponse.json({ ok: true, left: true, transferred: true });
    }
  }

  await db.delete(conversations).where(eq(conversations.id, id));
  log.info("Диалог удалён владельцем", { conversationId: id });
  return NextResponse.json({ ok: true, deleted: true });
});
