import { cookies } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "crypto";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import type { PublicUser } from "@/lib/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

export const SESSION_COOKIE = "pulse_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 дней

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const hashed = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, "hex");
  return hashed.length === keyBuf.length && timingSafeEqual(hashed, keyBuf);
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<string> {
  const token = randomUUID().replace(/-/g, "") + randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  await setSessionCookie(token, expiresAt);
  log.info("Создана сессия", { userId });
  return token;
}

/** Поставить сессионную куки (используется и при входе по токену). */
export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token));
    log.info("Сессия завершена", { tokenPrefix: token.slice(0, 8) });
  }
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const user = rows[0]?.user ?? null;
  if (user) {
    // heartbeat для статуса «в сети» (не ждём ответа, чтобы не тормозить запрос)
    db.update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id))
      .catch((err) => log.warn("Не удалось обновить lastSeenAt", { err: err instanceof Error ? err.message : String(err) }));
  }
  if (user?.bannedAt || user?.deletedAt) return null; // заблокирован или удалён админом
  return user;
}

/**
 * Если текущая сессия принадлежит заблокированному аккаунту — снести её
 * и вернуть причину бана (для экрана входа). Иначе — null.
 */
export async function checkBannedSession(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const [row] = await db
      .select({ userId: sessions.userId, bannedAt: users.bannedAt, banReason: users.banReason, deletedAt: users.deletedAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.token, token))
      .limit(1);
    if (!row || (!row.bannedAt && !row.deletedAt)) return null;
    await db.delete(sessions).where(eq(sessions.token, token));
    if (row.deletedAt) return "Аккаунт удалён администратором";
    return row.banReason || "Нарушение правил сервиса";
  } catch {
    return null;
  }
}

export function publicUser(u: User): PublicUser & { deleted?: boolean } {
  // Удалённый админом аккаунт: везде отображается как призрак
  if (u.deletedAt) {
    const base = publicUser({ ...u, deletedAt: null } as User);
    return {
      ...base,
      username: "deleted",
      displayName: "Удалённый аккаунт",
      avatarUrl: null,
      bannerUrl: null,
      bio: "",
      statusEmoji: "",
      online: false,
      showOnline: false,
      allowCalls: false,
      allowMessages: false,
      isAdmin: false,
      deleted: true,
    };
  }
  const online = Date.now() - new Date(u.lastSeenAt).getTime() < 45_000;
  return {
    isAdmin: !!u.isAdmin,
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bannerUrl: u.bannerUrl,
    bio: u.bio,
    statusEmoji: u.statusEmoji,
    nameColor: u.nameColor ?? "",
    // Приватность: если статус скрыт — не раскрываем ни онлайн, ни время визита.
    lastSeenAt: u.showOnline ? new Date(u.lastSeenAt).toISOString() : null,
    createdAt: new Date(u.createdAt).toISOString(),
    online: u.showOnline && online,
    showOnline: u.showOnline,
    allowCalls: u.allowCalls,
    allowMessages: u.allowMessages,
    allowGroupInvites: u.allowGroupInvites,
    discoverable: u.discoverable,
    birthday: u.birthday,
    premium: u.premium,
  };
}
