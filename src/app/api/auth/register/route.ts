import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, hashPassword, publicUser } from "@/lib/auth";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? "").trim();

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "Имя пользователя: 3–24 символа, латиница, цифры и _" },
        { status: 400 },
      );
    }
    if (password.length < 4) {
      return NextResponse.json(
        { error: "Пароль должен быть не короче 4 символов" },
        { status: 400 },
      );
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Такое имя пользователя уже занято" },
        { status: 409 },
      );
    }

    const [user] = await db
      .insert(users)
      .values({
        username: username.toLowerCase(),
        displayName: displayName || username,
        passwordHash: hashPassword(password),
      })
      .returning();

    await createSession(user.id);
    return NextResponse.json({ user: publicUser(user) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
