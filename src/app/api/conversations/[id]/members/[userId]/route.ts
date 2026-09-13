import { NextResponse } from "next/server";
import { db } from "@/db";
import { callParticipants, conversationMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";
import {
  findUsersByIds,
  getMembership,
  listMembers,
  normalizeKind,
  normalizeRole,
  requireMember,
} from "@/lib/conversations";
import { findActiveCall } from "@/lib/calls";

/**
 * PATCH /api/conversations/[id]/members/[userId] — сменить роль { role }.
 * Право назначать админов есть только у владельца.
 */
export const PATCH = withApi<{ id: string; userId: string }>(
  "conversations:member:role",
  async ({ req, params, me, log }) => {
    const { id, userId } = params;
    if (!isUuid(id) || !isUuid(userId))
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

    const access = await requireMember(id, me.id);
    if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (normalizeKind(access.conversation.kind) === "direct")
      return NextResponse.json({ error: "Это личный чат" }, { status: 400 });

    const myRole = normalizeRole(access.membership.role);
    if (myRole !== "owner")
      return NextResponse.json({ error: "Роли назначает только владелец" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const role = normalizeRole(body.role);
    if (role === "owner")
      return NextResponse.json({ error: "Владельца можно только сменить" }, { status: 400 });
    if (userId === me.id)
      return NextResponse.json({ error: "Нельзя изменить собственную роль" }, { status: 400 });

    const target = await getMembership(id, userId);
    if (!target) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });

    await db
      .update(conversationMembers)
      .set({ role })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
    log.info("Роль участника изменена", { conversationId: id, userId, role });

    const members = await listMembers(id);
    return NextResponse.json({
      members: members.map((m) => ({
        user: publicUser(m.user),
        role: m.member.role,
        joinedAt: new Date(m.member.joinedAt).toISOString(),
      })),
    });
  },
);

/**
 * DELETE /api/conversations/[id]/members/[userId] — исключить участника.
 * userId === «я» — просто выйти из группы/канала.
 * Владелец может всех; админ — только обычных участников.
 */
export const DELETE = withApi<{ id: string; userId: string }>(
  "conversations:member:remove",
  async ({ params, me, log }) => {
    const { id, userId } = params;
    if (!isUuid(id) || !isUuid(userId))
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

    const access = await requireMember(id, me.id);
    if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    if (normalizeKind(access.conversation.kind) === "direct")
      return NextResponse.json({ error: "Из личного чата нельзя удалить участника" }, { status: 400 });

    const myRole = normalizeRole(access.membership.role);
    const myself = userId === me.id;

    if (!myself) {
      if (myRole === "member")
        return NextResponse.json({ error: "Исключать могут только админы" }, { status: 403 });
      const target = await getMembership(id, userId);
      if (!target) return NextResponse.json({ error: "Участник не найден" }, { status: 404 });
      const targetRole = normalizeRole(target.role);
      if (targetRole === "owner")
        return NextResponse.json({ error: "Владельца нельзя исключить" }, { status: 403 });
      if (targetRole === "admin" && myRole !== "owner")
        return NextResponse.json({ error: "Админа может исключить только владелец" }, { status: 403 });
    }

    // Если человек в звонке этого диалога — выбрасываем из комнаты
    const active = await findActiveCall(id);
    if (active) {
      await db
        .delete(callParticipants)
        .where(and(eq(callParticipants.callId, active.id), eq(callParticipants.userId, userId)));
    }

    await db
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
    log.info(myself ? "Участник вышел" : "Участник исключён", { conversationId: id, userId, by: me.id });

    const members = await listMembers(id);
    return NextResponse.json({
      ok: true,
      members: members.map((m) => ({
        user: publicUser(m.user),
        role: m.member.role,
        joinedAt: new Date(m.member.joinedAt).toISOString(),
      })),
    });
  },
);

void findUsersByIds;
