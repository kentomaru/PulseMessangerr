import { getSessionUser, publicUser } from "@/lib/auth";
import AuthScreen from "@/components/AuthScreen";
import MessengerApp from "@/components/MessengerApp";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) return <AuthScreen />;
  const me = JSON.parse(JSON.stringify(publicUser(user)));
  return <MessengerApp me={me} />;
}
