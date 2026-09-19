import { checkBannedSession, getSessionUser, publicUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import MessengerApp from "@/components/MessengerApp";
import AuthScreen from "@/components/AuthScreen";
import DbConnecting from "@/components/DbConnecting";

const log = createLogger("page");

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const bannedNote = await checkBannedSession();
    if (bannedNote) return <AuthScreen bannedNote={bannedNote} />;
    const me = await getSessionUser();
    if (me) return <MessengerApp me={publicUser(me)} />;
    return <AuthScreen />;
  } catch (err) {
    // Чаще всего это «база ещё поднимается» (Railway): не роняем сервер,
    // показываем экран-заглушку, который сам обновит страницу.
    log.error("Не удалось загрузить страницу (возможно, БД ещё поднимается)", { err });
    return <DbConnecting />;
  }
}
