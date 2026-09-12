import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversationMembers, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { publicUser } from "@/lib/auth";
import {
  ensureMember,
  findUsersByIds,
  isManager,
  listMembers,
  normalizeKind,
  requireMember,
} from "@/lib/conversations";

/** GET /api/conversations/[id]/members — участники с ролями. */
export const GET = withApi<{ id: string }>("conversations:members", async ({ params, me }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const members = await listMembers(id);
  return NextResponse.json({
    members: members.map((m) => ({
      user: publicUser(m.user),
      role: m.member.role,
      joinedAt: new Date(m.member.joinedAt).toISOString(),
    })),
  });
});

/**
 * POST /api/conversations/[id]/members — добавить людей { userIds: string[] }.
 * В группе добавить может любой участник (как в Discord), в канале — только админы.
 */
export const POST = withApi<{ id: string }>("conversations:members:add", async ({ req, params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });

  const access = await requireMember(id, me.id);
  if (!access) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const kind = normalizeKind(access.conversation.kind);
  if (kind === "direct")
    return NextResponse.json({ error: "В личный чат нельзя добавить участников" }, { status: 400 });
  if (kind === "channel" && !isManager(access.membership.role))
    return NextResponse.json({ error: "Добавлять участников могут только админы канала" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
  if (ids.length === 0)
    return NextResponse.json({ error: "Не указано ни одного пользователя" }, { status: 400 });
  if (ids.length > 100)
    return NextResponse.json({ error: "Слишком много пользователей за раз" }, { status: 400 });

  const targets = (await findUsersByIds(ids)).filter((u) => u.id !== me.id);
  const existing = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, id));
  const existingIds = new Set(existing.map((e) => e.userId));

  const added: typeof users.$inferSelect[] = [];
  const blocked: string[] = [];
  for (const u of targets) {
    if (existingIds.has(u.id)) continue;
    // Приватность: кто запретил добавление в группы — пропускаем с пояснением.
    if (!u.allowGroupInvites) {
      blocked.push(`@${u.username}`);
      continue;
    }
    await ensureMember(id, u.id, "member");
    added.push(u);
  }
  if (added.length === 0 && blocked.length > 0) {
    return NextResponse.json(
      { error: `Никого не добавили: ${blocked.join(", ")} запретили добавление в группы в настройках приватности` },
      { status: 403 },
    );
  }

  log.info("Добавлены участники", {
    conversationId: id,
    by: me.username,
    added: String(added.length),
  });

  const members = await listMembers(id);
  return NextResponse.json({
    added: added.map((u) => publicUser(u)),
    members: members.map((m) => ({
      user: publicUser(m.user),
      role: m.member.role,
      joinedAt: new Date(m.member.joinedAt).toISOString(),
    })),
  });
});
