import { redirect } from "next/navigation";
import { canShowAdminLink } from "../lib/auth-policy";
import { getCurrentUser } from "../lib/authorization";
import AppHeader from "./components/app-header";
import ScheduleClient from "./schedule-client";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return <main className="site-shell">
    <AppHeader area="volunteer" user={user} />
    <ScheduleClient isAdmin={canShowAdminLink(user)} />
  </main>;
}
