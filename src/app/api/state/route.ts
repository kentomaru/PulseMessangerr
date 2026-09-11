import { getSessionUser, getSettings, loadChats, settingsToPayload, touchPresence } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  await touchPresence(me.id);
  const [chats, settings] = await Promise.all([loadChats(me.id), getSettings(me.id)]);
  return Response.json({
    me: {
      id: me.id,
      name: me.name,
      handle: me.handle,
      emoji: me.emoji,
      accent: me.accent,
      about: me.about,
    },
    chats,
    settings: settingsToPayload(settings),
    serverTime: new Date().toISOString(),
  });
}
