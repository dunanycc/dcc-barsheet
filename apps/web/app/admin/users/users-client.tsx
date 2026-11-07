"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type User = {
  id: string; firstName: string; lastName: string; email: string; status: string; role: string;
  lastAuthenticatedAt: string | null; identities: Array<{ provider: string }>;
  hiddenAt?: string | null;
  volunteerProfiles: Array<{ id: string; firstName: string; lastName: string; relationship: "PRIMARY" | "PARTNER"; active: boolean }>;
};
type AccessRequest = {
  id: string; firstName: string; lastName: string; email: string; requestedAt: string;
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function TrashIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>;
}

export default function UsersClient() {
  const [tab, setTab] = useState<"users" | "requests">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [hiddenUsers, setHiddenUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "lastLogin">("name");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const load = useCallback(async () => {
    try {
      const [userData, requestData] = await Promise.all([
        api("/api/admin/users", { cache: "no-store" }),
        api("/api/admin/access-requests", { cache: "no-store" }),
      ]);
      setUsers(userData.users ?? []);
      setHiddenUsers(userData.hiddenUsers ?? []);
      setRequests(requestData.requests ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load users.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add"); setMessage("");
    const form = event.currentTarget;
    try {
      await api("/api/admin/users", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset(); setAdding(false); setMessage("Volunteer added and approved."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add volunteer."); }
    finally { setBusy(""); }
  }

  async function userAction(userId: string, action: string) {
    const target = [...users, ...hiddenUsers].find((user) => user.id === userId);
    const name = target ? `${target.firstName} ${target.lastName}`.trim() : "this user";
    const confirmation = action === "disable" ? `Disable ${name}? They will no longer be able to sign in.`
      : action === "grant_admin" ? `Grant administrator access to ${name}?`
      : action === "remove_admin" ? `Remove administrator access from ${name}?`
      : action === "hide" ? `Remove ${name} from DCC Bar Schedule views? Their account will be disabled and their records hidden, but history will be preserved.`
      : action === "delete" ? `Permanently delete ${name}? This will remove their account, volunteer profiles, shift assignments, access requests, notifications, and account history. This cannot be undone.`
      : action === "unhide" ? `Unhide ${name}? Their account will remain disabled until you re-enable it.` : "";
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(`${userId}-${action}`); setMessage("");
    try {
      await api(`/api/admin/users/${userId}`, {
        method: action === "delete" ? "DELETE" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "delete" ? { confirmUserId: userId } : { action }),
      });
      setEditing(null); setMessage(action === "delete" ? "User and account history permanently deleted." : "User updated."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update user."); }
    finally { setBusy(""); }
  }

  async function decide(requestId: string, decision: "approve" | "reject") {
    setBusy(`${requestId}-${decision}`); setMessage("");
    try {
      await api(`/api/admin/access-requests/${requestId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }),
      });
      setMessage(decision === "approve" ? "Access approved. Email is queued but will not be sent yet." : "Request rejected.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update request."); }
    finally { setBusy(""); }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if(!editing)return;setBusy("edit");setMessage("");try{const values=Object.fromEntries(new FormData(event.currentTarget));await api(`/api/admin/users/${editing.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_account",...values,partnerActive:values.partnerActive==="on"})});setEditing(null);setMessage("User profile updated. Email changes require a new sign-in.");await load();}catch(error){setMessage(error instanceof Error?error.message:"Could not update user.");}finally{setBusy("");}}

  const sortedUsers = useMemo(() => [...users].sort((left, right) => {
    const byName = left.lastName.localeCompare(right.lastName, undefined, { sensitivity: "base" }) || left.firstName.localeCompare(right.firstName, undefined, { sensitivity: "base" });
    if (sortBy === "name") return byName;
    const leftLogin = left.lastAuthenticatedAt ? new Date(left.lastAuthenticatedAt).valueOf() : 0;
    const rightLogin = right.lastAuthenticatedAt ? new Date(right.lastAuthenticatedAt).valueOf() : 0;
    return rightLogin - leftLogin || byName;
  }), [sortBy, users]);

  return (
    <section>
      <div className="tab-bar">
        <button aria-selected={tab === "users"} className={`tab-btn${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")} role="tab">Users</button>
        <button aria-selected={tab === "requests"} className={`tab-btn${tab === "requests" ? " active" : ""}`} onClick={() => setTab("requests")} role="tab">Access Requests ({requests.length})</button>
      </div>
      {message && <div className="notice" role="status">{message}</div>}
      {tab === "users" ? (
        <>
          <div className="users-toolbar"><label className="users-sort">Sort by<select onChange={(event) => setSortBy(event.target.value as "name" | "lastLogin")} value={sortBy}><option value="name">Name</option><option value="lastLogin">Last login</option></select></label><button className="button small" onClick={() => setAdding(true)} type="button">+ Add volunteer</button></div>
          {[
            { title: "Admins", entries: sortedUsers.filter(user => user.status !== "DISABLED" && user.role === "ADMIN") },
            { title: "Members", entries: sortedUsers.filter(user => user.status !== "DISABLED" && user.role !== "ADMIN") },
            { title: "Disabled users", entries: sortedUsers.filter(user => user.status === "DISABLED") },
          ].map(group => <section className="user-group" key={group.title}><h2>{group.title} ({group.entries.length})</h2>
          {group.entries.length === 0 ? <p className="muted">No {group.title.toLowerCase()}.</p> : <div className="admin-table-wrap users-table-wrap"><table className="admin-table user-management-table users-table"><thead><tr>
            <th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Identity</th><th>Last login</th><th>Actions</th>
          </tr></thead><tbody>{group.entries.map((user) => <tr className={user.role === "ADMIN" ? "admin-user-row" : undefined} key={user.id}>
            <td data-label="Name">{user.firstName} {user.lastName}</td><td data-label="Email">{user.email}</td><td data-label="Status">{user.status}</td><td data-label="Role">{user.role}</td>
            <td data-label="Identity">{user.identities.map((item) => item.provider === "GOOGLE" ? "Google verified" : item.provider === "YAHOO" ? "Yahoo verified" : "Email asserted").join(", ") || "Not signed in"}</td>
            <td data-label="Last login">{user.lastAuthenticatedAt ? new Date(user.lastAuthenticatedAt).toLocaleDateString() : "Never"}</td>
            <td className="action-cell" data-label="Actions"><div className="user-actions">
              <button className="button secondary small" disabled={Boolean(busy)} onClick={() => setEditing(user)}>Edit</button>
              <Link className="button secondary small" href={`/admin/history?userId=${encodeURIComponent(user.id)}`}>History</Link>
              {user.role === "ADMIN" ? <button className="button secondary small" disabled={Boolean(busy)} onClick={() => void userAction(user.id, "remove_admin")}>Remove admin</button> : <button className="button secondary small" disabled={Boolean(busy)} onClick={() => void userAction(user.id, "grant_admin")}>Grant admin</button>}
              <button aria-label={`Hide ${user.firstName} ${user.lastName}`} title="Move to hidden users" className="button danger-outline small trash-button" disabled={Boolean(busy)} onClick={() => void userAction(user.id, "hide")}><TrashIcon /></button>
            </div></td>
          </tr>)}</tbody></table></div>}</section>)}
          {hiddenUsers.length > 0 && <section className="hidden-users-section"><h2>Hidden users</h2><p className="muted">Removed users are excluded from operational views. Their history is preserved until permanently deleted. Deleting a hidden user also deletes their account history and cannot be undone.</p><div className="admin-table-wrap"><table className="admin-table user-management-table hidden-users-table"><thead><tr><th>Name</th><th>Email</th><th>Hidden</th><th>Action</th></tr></thead><tbody>{hiddenUsers.map((user)=><tr key={user.id}><td data-label="Name">{user.firstName} {user.lastName}</td><td data-label="Email">{user.email}</td><td data-label="Hidden">{user.hiddenAt ? new Date(user.hiddenAt).toLocaleDateString() : "—"}</td><td className="action-cell" data-label="Action"><div className="user-actions"><button className="button secondary small" disabled={Boolean(busy)} onClick={()=>void userAction(user.id,"unhide")}>Unhide</button><button aria-label={`Permanently delete ${user.firstName} ${user.lastName}`} title="Permanently delete user and account history" className="button danger-outline small trash-button" disabled={Boolean(busy)} onClick={()=>void userAction(user.id,"delete")}><TrashIcon /></button></div></td></tr>)}</tbody></table></div></section>}
        </>
      ) : requests.length ? (
        <div className="admin-table-wrap access-requests-table"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Requested</th><th>Actions</th></tr></thead>
          <tbody>{requests.map((item) => <tr key={item.id}><td data-label="Name">{item.firstName} {item.lastName}</td><td data-label="Email">{item.email}</td>
            <td data-label="Requested">{new Date(item.requestedAt).toLocaleString()}</td><td className="action-cell" data-label="Actions">
              <button className="button small" disabled={busy.startsWith(item.id)} onClick={() => void decide(item.id, "approve")}>Approve</button>
              <button className="button danger small" disabled={busy.startsWith(item.id)} onClick={() => void decide(item.id, "reject")}>Reject</button>
            </td></tr>)}</tbody></table></div>
      ) : <div className="state-card">No pending access requests.</div>}
      {adding&&<div className="modal-overlay" onClick={()=>setAdding(false)}><div aria-labelledby="add-user-title" aria-modal="true" className="modal" onClick={e=>e.stopPropagation()} role="dialog"><h2 id="add-user-title">Add volunteer</h2><form onSubmit={e=>void addUser(e)}><div className="form-group"><label>First name<input name="firstName" required /></label></div><div className="form-group"><label>Last name<input name="lastName" required /></label></div><div className="form-group"><label>Approved login email<input name="email" required type="email" /></label></div><div className="form-actions"><button className="button secondary" onClick={()=>setAdding(false)} type="button">Cancel</button><button className="button" disabled={busy==="add"}>Save volunteer</button></div></form></div></div>}
      {editing&&(()=>{const partner=editing.volunteerProfiles.find(p=>p.relationship==="PARTNER"&&p.active);return <div className="modal-overlay" onClick={()=>setEditing(null)}><div aria-modal="true" className="modal" onClick={e=>e.stopPropagation()} role="dialog"><h2>Edit user</h2><p className="muted">Administrator account controls</p><button className="button danger small" disabled={Boolean(busy)} onClick={()=>void userAction(editing.id,editing.status === "DISABLED" ? "enable" : "disable")} type="button">{editing.status === "DISABLED" ? "Re-enable user" : "Disable user"}</button><form onSubmit={e=>void saveUser(e)}><div className="form-group"><label>First name<input defaultValue={editing.firstName} name="firstName" required /></label></div><div className="form-group"><label>Last name<input defaultValue={editing.lastName} name="lastName" required /></label></div><div className="form-group"><label>Approved login email<input defaultValue={editing.email} name="email" required type="email" /></label><p className="muted">Changing email signs the account out and unlinks existing authentication identities.</p></div><label className="settings-check-label"><input defaultChecked={Boolean(partner)} name="partnerActive" type="checkbox" /> Active spouse or partner</label><div className="form-group"><label>Partner first name<input defaultValue={partner?.firstName||""} name="partnerFirstName" /></label></div><div className="form-group"><label>Partner last name<input defaultValue={partner?.lastName||""} name="partnerLastName" /></label></div><div className="form-actions"><button className="button secondary" onClick={()=>setEditing(null)} type="button">Cancel</button><button className="button" disabled={busy==="edit"}>Save user</button></div></form></div></div>})()}
    </section>
  );
}
