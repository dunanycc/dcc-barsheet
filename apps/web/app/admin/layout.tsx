import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { AuthorizationError, requireAdmin } from "../../lib/authorization";
import AppHeader from "../components/app-header";
import AdminNav from "./admin-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let user;
  try { user = await requireAdmin(); } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect("/sign-in");
    redirect("/");
  }
  return <main className="site-shell">
    <AppHeader area="admin" user={user} />
    <AdminNav />
    {children}
  </main>;
}
