import UsersClient from "./users-client";

export default function UsersPage() {
  return <section className="admin-page-section">
    <div className="page-heading"><h1>Users</h1><p>Approve volunteers and manage member and administrator access.</p></div>
    <UsersClient />
  </section>;
}
