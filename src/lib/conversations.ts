/** Маркер связи «группа = обсуждение канала». Храним в about группы, чтобы
 * не добавлять колонку в БД (Railway не гоняет миграции при деплое). */
export const DISCUSSION_MARKER = "pulse-discussion-of:";

/**
 * Серверные помощники для диалогов: личные чаты, группы и каналы.
 * Здесь живут проверки доступа (кто участник, кто админ/владелец),
 * сериализация диалога для клиента и работа с инвайт-ссылками.
 */
import { db } from "@/db";
import {
  conversationMembers,
  conversations,
  users,
  type Conversation,
  type ConversationMember,
  type User,
} from "@/db/schema";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { publicUser } from "@/lib/auth";
import type {
  ConversationInfo,
  ConversationKind,
  ConversationMemberItem,
  MemberRole,
  PublicUser,
} from "@/lib/types";

export const ROLE_LEVEL: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

/** Токен ссылки-приглашения в группу/канал. */
export { newJoinToken as newInviteToken } from "@/db/schema";

export function normalizeKind(kind: unknown): ConversationKind {
  return kind === "channel" ? "channel" : kind === "group" ? "group" : "direct";
}

export function normalizeRole(role: unknown): MemberRole {
  return role === "owner" ? "owner" : role === "admin" ? "admin" : "member";
}

/** Строка участника диалога (или null, если не участник). */
export async function getMembership(
  conversationId: string,
  userId: string,
): Promise<ConversationMember | null> {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return rows[0] ?? null;
}

/** Диалог + моя роль, либо null если нет доступа. */
export async function requireMember(
  conversationId: string,
  userId: string,
): Promise<{ conversation: Conversation; membership: ConversationMember } | null> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;
  const membership = await getMembership(conversationId, userId);
  if (!membership) return null;
  return { conversation, membership };
}

/** Достаточно ли прав для админ-действий (owner/admin). */
export function isManager(role: MemberRole | string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Все участники диалога с профилями (отсортированы: владелец → админы → остальные). */
export async function listMembers(conversationId: string): Promise<
  { member: ConversationMember; user: User }[]
> {
  const rows = await db
    .select({ member: conversationMembers, user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(conversationMembers.userId, users.id))
    .where(eq(conversationMembers.conversationId, conversationId))
    .orderBy(asc(conversationMembers.joinedAt));
  return rows.sort(
    (a, b) => ROLE_LEVEL[normalizeRole(b.member.role)] - ROLE_LEVEL[normalizeRole(a.member.role)],
  );
}

export function memberItem(m: ConversationMember, u: User): ConversationMemberItem {
  return {
    user: publicUser(u),
    role: normalizeRole(m.role),
    lastReadAt: m.lastReadAt ? new Date(m.lastReadAt).toISOString() : null,
    typingAt: m.typingAt ? new Date(m.typingAt).toISOString() : null,
    joinedAt: new Date(m.joinedAt).toISOString(),
  };
}

/** Название личного чата = имя собеседника, группы/канала = своё имя. */
export function conversationTitle(
  conv: Pick<Conversation, "kind" | "name">,
  peer?: PublicUser | null,
): string {
  if (conv.kind === "direct") return peer?.displayName ?? "Чат";
  return conv.name?.trim() || (conv.kind === "channel" ? "Канал" : "Группа");
}

/** Диалог в формате клиента. */
export async function serializeConversation(
  conv: Conversation,
  meId: string,
  opts: { members?: { member: ConversationMember; user: User }[] } = {},
): Promise<ConversationInfo & { members: ConversationMemberItem[] }> {
  const rows = opts.members ?? (await listMembers(conv.id));
  const kind = normalizeKind(conv.kind);
  const myMembership = rows.find((r) => r.user.id === meId)?.member ?? null;
  const peerRow = rows.find((r) => r.user.id !== meId);
  const peer = peerRow ? publicUser(peerRow.user) : null;

  return {
    id: conv.id,
    kind,
    name: conv.name,
    avatarUrl: conv.avatarUrl,
    about: conv.about ?? "",
    isPrivate: !!conv.isPrivate,
    // «Запрет копирования/сохранения» — как ограниченные каналы в ТГ
    restricted: !!(conv as { restricted?: boolean }).restricted,
    slowMode: typeof (conv as { slowMode?: number }).slowMode === "number" ? (conv as { slowMode?: number }).slowMode ?? 0 : 0,
    ownerId: conv.ownerId,
    createdAt: new Date(conv.createdAt).toISOString(),
    memberCount: rows.length,
    myRole: normalizeRole(myMembership?.role ?? "member"),
    // Токен-юзернейм канала/группы видят только владельцы и админы
    inviteToken: isManager(myMembership?.role ?? "member") ? conv.inviteToken ?? null : null,
    title: conversationTitle({ kind, name: conv.name }, peer),
    members: rows.map((r) => memberItem(r.member, r.user)),
  };
}

/** Добавляет пользователя в диалог (идемпотентно): если уже есть — роль не меняем. */
export async function ensureMember(
  conversationId: string,
  userId: string,
  role: MemberRole = "member",
): Promise<void> {
  const existing = await getMembership(conversationId, userId);
  if (existing) return;
  await db
    .insert(conversationMembers)
    .values({ conversationId, userId, role })
    .onConflictDoNothing();
}

/** Пользователи по списку id (несуществующие просто отбрасываются). */
export async function findUsersByIds(ids: string[]): Promise<User[]> {
  const clean = Array.from(new Set(ids.filter((id) => typeof id === "string" && id.length > 0)));
  if (clean.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, clean));
}
