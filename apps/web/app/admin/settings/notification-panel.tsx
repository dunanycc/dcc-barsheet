"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Notification = { id: string; type: string; recipientEmail: string; status: string; attemptCount: number; createdAt: string; sentAt: string | null; lastAttemptAt: string | null; lastError: string | null };
const labels: Record<string, string> = { INITIAL_AUTHORIZATION: "Authorization granted", ACCESS_APPROVED: "Access approved", ASSIGNMENT_REMOVED: "Assignment removed", ASSIGNMENT_REPLACED: "Assignment replaced", EVENT_CHANGED: "Event changed", EVENT_CANCELLED: "Event cancelled", TEST_EMAIL: "Test email" };
async function api(path: string, init?: RequestInit) { const response = await fetch(path, init); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Request failed."); return payload; }
function typeLabel(item: Notification) { return labels[item.type] || item.type.replaceAll("_", " ").toLowerCase(); }
function statusLabel(status: string) { return status.charAt(0) + status.slice(1).toLowerCase(); }
function attemptedAt(item: Notification) { return item.sentAt || item.lastAttemptAt; }

export default function NotificationPanel() {
  const [items, setItems] = useState<Notification[]>([]); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(""); const [adminConfigured, setAdminConfigured] = useState(false);
  const load = useCallback(async () => { try { const data = await api("/api/admin/notifications", { cache: "no-store" }); setItems(data.notifications || []); setAdminConfigured(Boolean(data.adminRecipientConfigured)); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load notifications."); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function processPending() { setBusy("process"); setMessage(""); try { const result = await api("/api/admin/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 10 }) }); setMessage(`Processed ${result.processed}: ${result.sent} sent, ${result.failed} failed.`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not process notifications."); } finally { setBusy(""); } }
  async function retry(id: string) { setBusy(id); setMessage(""); try { await api(`/api/admin/notifications/${id}/retry`, { method: "POST" }); setMessage("Notification queued for retry."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry notification."); } finally { setBusy(""); } }
  async function sendTest(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const email = String(new FormData(form).get("email") || ""); setBusy("test"); setMessage(""); try { await api("/api/admin/notifications/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); setMessage("Test email sent."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Test email could not be sent."); await load(); } finally { setBusy(""); } }

  return <details className="notification-delivery settings-box">
    <summary><span><strong>Email delivery tools</strong><small>Test delivery, process the queue, and review recent email activity.</small></span></summary>
    <div className="notification-delivery-content">
    <div className="settings-box"><h3>Email delivery</h3><p className="muted">Transactional email is queued first and delivered separately. Processing failures do not undo schedule or access changes.</p>
      {!adminConfigured && <div className="notice">No administrator notification email is configured. Volunteer delivery still works; administrator alerts are disabled.</div>}
      <form className="test-email-form" onSubmit={(event) => void sendTest(event)}><label htmlFor="test-recipient">Staging test recipient</label><input id="test-recipient" name="email" placeholder="recipient@example.com" required type="email" /><button className="button" disabled={busy === "test"}>Send test email</button></form>
      <div className="notification-actions"><button className="button secondary" disabled={busy === "process"} onClick={() => void processPending()} type="button">Process pending</button></div>
      {message && <div className="notice" role="status">{message}</div>}
    </div>
    <div className="settings-box"><h3>Recent delivery</h3>
      <div className="notification-list">
        {items.map((item) => <details className="notification-entry" key={item.id}>
          <summary><span><strong>{typeLabel(item)}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><span className={`delivery-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></summary>
          <dl><div><dt>Recipient</dt><dd>{item.recipientEmail}</dd></div><div><dt>Sent / attempted</dt><dd>{attemptedAt(item) ? new Date(attemptedAt(item)!).toLocaleString() : "—"}</dd></div><div><dt>Attempts</dt><dd>{item.attemptCount}</dd></div>{item.lastError && <div className="wide"><dt>Error</dt><dd className="notification-error">{item.lastError}</dd></div>}</dl>
          {item.status === "FAILED" && item.attemptCount < 5 && <button className="button secondary small" disabled={busy === item.id} onClick={() => void retry(item.id)} type="button">Retry delivery</button>}
        </details>)}
        {!items.length && <p className="muted">No notifications have been queued.</p>}
      </div>
      <div className="admin-table-wrap notification-table"><table className="admin-table"><thead><tr><th>Type</th><th>Recipient</th><th>Status</th><th>Created</th><th>Sent / attempted</th><th>Attempts</th><th>Action</th></tr></thead><tbody>
        {items.map((item) => <tr key={item.id}><td>{typeLabel(item)}</td><td>{item.recipientEmail}</td><td>{statusLabel(item.status)}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td>{attemptedAt(item) ? new Date(attemptedAt(item)!).toLocaleString() : "—"}{item.lastError && <span className="notification-error">{item.lastError}</span>}</td><td>{item.attemptCount}</td><td>{item.status === "FAILED" && item.attemptCount < 5 ? <button className="button secondary small" disabled={busy === item.id} onClick={() => void retry(item.id)}>Retry</button> : "—"}</td></tr>)}
        {!items.length && <tr><td colSpan={7}>No notifications have been queued.</td></tr>}
      </tbody></table></div>
    </div>
    </div>
  </details>;
}
