import AdminPageHeading from "../admin-page-heading";
import UsersClient from "./users-client";

export default function UsersPage() {
  return <section className="admin-page-section">
    <AdminPageHeading title="Users" description="Approve volunteers and manage member and administrator access." />
    <UsersClient />
  </section>;
}
