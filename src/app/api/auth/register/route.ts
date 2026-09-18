import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, hashPassword, publicUser } from "@/lib/auth";
import { withPublicApi } from "@/lib/api-helpers";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export const POST = withPublicApi("auth/register", async ({ req, log }) => {
  const body = await req.json();
  let username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();

  // Можно создать аккаунт без юзернейма — сгенерируем временный,
  // потом пользователь задаст свой в профиле.
  if (!username) {
    for (let i = 0; i < 5; i++) {
      username = `user_${Math.floor(100000 + Math.random() * 900000)}`;
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (!taken) break;
    }
  } else if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Имя пользователя: 3–24 символа, латиница, цифры и _ (или оставьте пустым)" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 8 символов" },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Такое имя пользователя уже занято" }, { status: 409 });
  }

  const [user] = await db
    .insert(users)
    .values({
      username: username.toLowerCase(),
      displayName: displayName.slice(0, 40) || "Новый пользователь",
      passwordHash: hashPassword(password),
      // Админ платформы назначается по юзернейму (@flytomaru)
      isAdmin: username.toLowerCase() === "flytomaru",
    })
    .returning();

  await createSession(user.id);
  log.info("Новый пользователь", { username: user.username, userId: user.id });
  return NextResponse.json({ user: publicUser(user) });
});
