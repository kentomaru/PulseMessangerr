import { redirect } from "next/navigation";
import Messenger from "@/components/Messenger";
import { ensureSeed, getSessionUser, getSettings, loadChats, settingsToPayload } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  await ensureSeed();
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const [chats, settings] = await Promise.all([loadChats(me.id), getSettings(me.id)]);

  return (
    <Messenger
      me={{
        id: me.id,
        name: me.name,
        handle: me.handle,
        emoji: me.emoji,
        accent: me.accent,
        about: me.about,
      }}
      initialChats={chats}
      initialSettings={settingsToPayload(settings)}
    />
  );
}
