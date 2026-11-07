import { canShowAdminLink, type AccessUser } from "../../lib/auth-policy";
import SignOutForm from "../sign-out-form";

export default function AccountMenu({ user }: { user: AccessUser }) {
  const name = `${user.firstName} ${user.lastName}`.trim();
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "U";
  const isAdmin = canShowAdminLink(user);
  return <details className="account-menu">
    <summary aria-label={`Open account menu for ${name}`}>
      <span aria-hidden="true" className="account-avatar">{initials}</span>
      <span className="account-trigger-copy"><strong>{user.firstName || name}</strong></span>
    </summary>
    <div className="account-popover">
      <div className="account-identity"><strong>{name}</strong><span>{user.email}</span>{isAdmin && <span className="role-badge">Administrator</span>}</div>
      <SignOutForm />
    </div>
  </details>;
}
