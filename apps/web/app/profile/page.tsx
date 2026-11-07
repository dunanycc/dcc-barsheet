import Link from "next/link";
import { redirect } from "next/navigation";
import { canShowAdminLink } from "../../lib/auth-policy";
import { getCurrentUser } from "../../lib/authorization";
import AppHeader from "../components/app-header";
import ProfileClient from "./profile-client";

export default async function ProfilePage() {
  const user = await getCurrentUser(); if (!user) redirect("/sign-in");
  const isAdmin = canShowAdminLink(user);
  return <main className="site-shell"><AppHeader area="volunteer" user={user} /><nav aria-label="Volunteer views" className="tab-bar volunteer-tabs"><Link className="tab-btn" href="/">Schedule</Link><Link className="tab-btn" href="/?tab=myshifts">My Shifts</Link><Link aria-current="page" className="tab-btn active" href="/profile">My Profile</Link>{isAdmin && <Link className="tab-btn" href="/admin">Administration</Link>}</nav><ProfileClient /></main>;
}
