import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isUuid, withApi } from "@/lib/api-helpers";
import { newInviteToken, normalizeKind, requireMember } from "@/lib/conversations";

/**
 * GET/POST /api/conversations/[id]/invites — постоянная ссылка-приглашение
 * в группу/канал: `…/#group=<token>`. По ней заходят даже в приватные.
 */
async function inviteOf(conversationId: string, meId: string, log: { info: (m: string, x?: Record<string, string>) => void }) {
  const access = await requireMember(conversationId, meId);
  if (!access) return { error: "Нет доступа", status: 403 } as const;
  if (normalizeKind(access.conversation.kind) === "direct")
    return { error: "У личного чата нет ссылки-приглашения", status: 400 } as const;

  let token = access.conversation.inviteToken;
  if (!token) {
    token = newInviteToken();
    await db
      .update(conversations)
      .set({ inviteToken: token })
      .where(eq(conversations.id, conversationId));
    log.info("Создана ссылка-приглашение", { conversationId });
  }
  return { token } as const;
}

export const GET = withApi<{ id: string }>("conversations:invites", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const res = await inviteOf(id, me.id, log);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ token: res.token });
});

export const POST = withApi<{ id: string }>("conversations:invites:create", async ({ params, me, log }) => {
  const { id } = params;
  if (!isUuid(id)) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
  const res = await inviteOf(id, me.id, log);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ token: res.token });
});
