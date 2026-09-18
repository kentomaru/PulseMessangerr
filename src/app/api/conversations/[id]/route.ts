import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, conversationMembers, conversations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import {
  isManager,
  listMembers,
  newInviteToken,
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
    const name = body.name.trim().slice(0, 32);
    if (name.length < 5)
      return NextResponse.json({ error: "Название: от 5 до 32 символов" }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.about === "string") patch.about = body.about.trim().slice(0, 255);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null)
    patch.avatarUrl = body.avatarUrl && String(body.avatarUrl).startsWith("/api/files/") ? body.avatarUrl : null;
  if (typeof body.isPrivate === "boolean") patch.isPrivate = body.isPrivate;
  // «Скрывать владельца канала» — переключает только владелец
  if (typeof body.showOwner === "boolean") {
    if (access.membership.role !== "owner")
      return NextResponse.json({ error: "Это решает владелец" }, { status: 403 });
    patch.showOwner = body.showOwner;
  }
  // Юзернейм чата/канала (@name): храним в invite_token — без новых колонок БД
  if (typeof body.username === "string") {
    if (access.membership.role !== "owner")
      return NextResponse.json({ error: "Юзернейм задаёт владелец" }, { status: 403 });
    const un = body.username.trim().toLowerCase().replace(/^@+/, "").slice(0, 32);
    if (un === "") {
      // очистить — вернём случайный токен ссылки
      patch.inviteToken = null;
    } else {
      if (!/^[a-z0-9_]{5,32}$/.test(un))
        return NextResponse.json(
          { error: "Юзернейм: 5–32 символа, латиница, цифры и «_»" },
          { status: 400 },
        );
      const [taken] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.inviteToken, un))
        .limit(1);
      if (taken && taken.id !== id)
        return NextResponse.json({ error: "Юзернейм уже занят" }, { status: 409 });
      patch.inviteToken = un;
    }
  }
  if (body.kind === "group" || body.kind === "channel") {
    patch.kind = body.kind;
    patch.isGroup = body.kind === "group";
  }

  // «Запретить копирование/сохранение контента» — как ограниченные каналы в ТГ
  if (typeof body.restricted === "boolean") {
    if (access.membership.role !== "owner")
      return NextResponse.json({ error: "Ограничения задаёт владелец" }, { status: 403 });
    patch.restricted = body.restricted;
  }

  // Слоумод: минимальная пауза между сообщениями участников (как в ТГ)
  if (typeof body.slowMode === "number") {
    if (access.membership.role !== "owner" && access.membership.role !== "admin")
      return NextResponse.json({ error: "Слоумод настраивают администраторы" }, { status: 403 });
    patch.slowMode = Math.max(0, Math.min(3600, Math.round(body.slowMode)));
  }

  // Отозвать инвайт-ссылку: выпускаем новый случайный токен (старые перестают работать)
  if (body.revokeInvite === true) {
    if (access.membership.role !== "owner")
      return NextResponse.json({ error: "Инвайт отзывает владелец" }, { status: 403 });
    patch.inviteToken = newInviteToken();
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  const [updated] = await db.update(conversations).set(patch).where(eq(conversations.id, id)).returning();
  log.info("Диалог обновлён", { conversationId: id, fields: Object.keys(patch).join(",") });

  const members = await listMembers(id);
  return NextResponse.json({ conversation: await serializeConversation(updated, me.id, { members }) });
});

/**
 * DELETE /api/conversations/[id] — удаление/выход из чата.
 *
 * Личный чат:
 *   - без параметра — «удалить у себя»: выходите из диалога; если второй
 *     участник тоже удалит — чат стирается полностью;
 *   - ?forAll=1 — «удалить для всех»: чат и переписка удаляются целиком.
 * Группа/канал: участник выходит, владелец удаляет целиком (как раньше).
 */
export const DELETE = withApi<{ id: string }>("conversations:leave", async ({ params, req, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const conv = access.conversation;
  const kind = normalizeKind(conv.kind);

  // Я в звонке этого диалога — выходим из комнаты
  const leaveActiveCall = async () => {
    const active = await findActiveCall(id);
    if (!active) return;
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
  };

  /* ── личный чат ── */
  if (kind === "direct") {
    const forAll = req.nextUrl.searchParams.get("forAll") === "1";
    await leaveActiveCall();
    if (forAll) {
      // Удаляем переписку и сам диалог для обоих (каскады подчистят остальное)
      await db.delete(conversations).where(eq(conversations.id, id));
      log.info("Личный чат удалён для всех", { conversationId: id, by: me.id });
      return NextResponse.json({ ok: true, deleted: true });
    }
    // «Удалить у себя»: просто выходим из диалога
    await db
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me.id)));
    // Если участников не осталось — убираем пустой диалог и переписку
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, id));
    if (Number(n) === 0) {
      await db.delete(conversations).where(eq(conversations.id, id));
      log.info("Личный чат удалён (последний участник вышел)", { conversationId: id });
      return NextResponse.json({ ok: true, deleted: true });
    }
    log.info("Личный чат скрыт у себя", { conversationId: id, userId: me.id });
    return NextResponse.json({ ok: true, left: true });
  }

  const isOwner = conv.ownerId === me.id || normalizeRole(access.membership.role) === "owner";

  await leaveActiveCall();

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
