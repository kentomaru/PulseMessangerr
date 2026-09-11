import { db } from "@/db";
import { users, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, getSettings, settingsToPayload } from "@/lib/server";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "theme",
  "accent",
  "wallpaper",
  "bubbleStyle",
  "fontSize",
  "density",
  "enterToSend",
  "sounds",
  "notifications",
  "messagePreview",
  "readReceipts",
  "typingStatus",
  "lastSeenPrivacy",
  "autoDownload",
  "language",
  "animations",
  "largeEmoji",
] as const;

export async function GET() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings(me.id);
  return Response.json({ settings: settingsToPayload(settings) });
}

export async function PATCH(request: Request) {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ALLOWED_KEYS) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (typeof value === "boolean" || typeof value === "string") patch[key] = value;
  }
  await db.update(userSettings).set(patch).where(eq(userSettings.userId, me.id));

  if (typeof payload.name === "string" && payload.name.trim().length >= 2) {
    await db
      .update(users)
      .set({ name: payload.name.trim().slice(0, 60) })
      .where(eq(users.id, me.id));
  }
  if (typeof payload.about === "string") {
    await db.update(users).set({ about: payload.about.slice(0, 160) }).where(eq(users.id, me.id));
  }
  if (typeof payload.emoji === "string") {
    await db.update(users).set({ emoji: payload.emoji.slice(0, 8) }).where(eq(users.id, me.id));
  }
  if (typeof payload.accent === "string") {
    await db.update(users).set({ accent: payload.accent }).where(eq(users.id, me.id));
  }
  if (payload.avatarFileId !== undefined) {
    await db
      .update(users)
      .set({ avatarFileId: payload.avatarFileId === null ? null : Number(payload.avatarFileId) })
      .where(eq(users.id, me.id));
  }

  const settings = await getSettings(me.id);
  return Response.json({ settings: settingsToPayload(settings) });
}
