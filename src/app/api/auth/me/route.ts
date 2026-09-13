import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  callInvites,
  callParticipants,
  calls,
  callSignals,
  conversationMembers,
  messages,
  sessions,
  stories,
  users,
} from "@/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { destroySession, getSessionUser, publicUser } from "@/lib/auth";
import { withApi } from "@/lib/api-helpers";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export const GET = withApi("auth/me", async ({ me }) => {
  return NextResponse.json({ user: publicUser(me) });
});

export const PATCH = withApi("auth/me", async ({ req, me, log }) => {
  const body = await req.json();
  const patch: Partial<typeof users.$inferInsert> = {};

  if (typeof body.displayName === "string") {
    const dn = body.displayName.trim().slice(0, 64);
    if (dn.length < 1)
      return NextResponse.json({ error: "Имя не может быть пустым" }, { status: 400 });
    patch.displayName = dn;
  }
  if (typeof body.bio === "string") patch.bio = body.bio.trim().slice(0, 280);
  // Смена юзернейма: латиница/цифры/«_», 3–20 символов, уникальность
  if (typeof body.username === "string") {
    const un = body.username.trim().toLowerCase().replace(/^@+/, "").slice(0, 20);
    if (!/^[a-z0-9_]{3,20}$/.test(un))
      return NextResponse.json(
        { error: "Юзернейм: 3–20 символов, латиница, цифры и «_»" },
        { status: 400 },
      );
    if (un !== me.username) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, un))
        .limit(1);
      if (taken)
        return NextResponse.json({ error: "Юзернейм уже занят" }, { status: 409 });
      patch.username = un;
    }
  }
  // Кастомный статус-эмодзи: эмодзи или ссылка на анимированную гифку
  if (typeof body.statusEmoji === "string") patch.statusEmoji = body.statusEmoji.trim().slice(0, 300);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null)
    patch.avatarUrl = body.avatarUrl || null;
  if (typeof body.bannerUrl === "string" || body.bannerUrl === null)
    patch.bannerUrl = body.bannerUrl || null;
  // Настройки приватности
  if (typeof body.showOnline === "boolean") patch.showOnline = body.showOnline;
  if (typeof body.allowCalls === "boolean") patch.allowCalls = body.allowCalls;
  if (typeof body.allowMessages === "boolean") patch.allowMessages = body.allowMessages;
  if (typeof body.allowGroupInvites === "boolean") patch.allowGroupInvites = body.allowGroupInvites;
  if (typeof body.discoverable === "boolean") patch.discoverable = body.discoverable;
  if (typeof body.birthday === "string") patch.birthday = body.birthday.trim().slice(0, 20);

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });

  const [updated] = await db.update(users).set(patch).where(eq(users.id, me.id)).returning();
  log.info("Профиль обновлён", { userId: me.id, fields: Object.keys(patch).join(",") });
  return NextResponse.json({ user: publicUser(updated) });
});

/**
 * DELETE /api/auth/me — полное удаление аккаунта (право на приватность).
 * Удаляются: сессии, истории, участники чатов, сообщения пользователя,
 * его звонки и осиротевшие диалоги.
 */
export const DELETE = withApi("auth/me:delete", async ({ me, log }) => {
  log.warn("Удаление аккаунта", { userId: me.id, username: me.username });

  // Порядок важен: сначала то, что ссылается на звонки и сообщения,
  // потом сами звонки/сообщения, затем диалоги и аккаунт.
  await db.delete(sessions).where(eq(sessions.userId, me.id));
  await db.delete(stories).where(eq(stories.userId, me.id));
  await db.delete(callInvites).where(
    or(eq(callInvites.userId, me.id), eq(callInvites.invitedBy, me.id)),
  );
  await db.delete(callSignals).where(
    or(eq(callSignals.fromUserId, me.id), eq(callSignals.toUserId, me.id)),
  );
  await db.delete(callParticipants).where(eq(callParticipants.userId, me.id));
  await db.delete(calls).where(eq(calls.hostId, me.id));
  await db.delete(messages).where(eq(messages.senderId, me.id));
  await db.delete(conversationMembers).where(eq(conversationMembers.userId, me.id));
  // Диалоги, в которых не осталось участников
  await db.execute(
    sql`delete from conversations c where not exists (select 1 from conversation_members m where m.conversation_id = c.id)`,
  );
  await db.delete(users).where(eq(users.id, me.id));

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  log.info("Аккаунт удалён", { userId: me.id });
  await destroySession().catch(() => {});
  return NextResponse.json({ ok: true });
});
