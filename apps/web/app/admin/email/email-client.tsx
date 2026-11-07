"use client";
import { useCallback, useEffect, useState } from "react";
import type { EmailDraft, EmailRecipient } from "../../../lib/admin-email";
type History = { id: string; subject: string; message: string; signature: string; recipients: EmailRecipient[]; createdAt: string; senderName: string; delivery: Record<string, number> };
async function api(action?: string, data: object = {}, before?: string) {
  const response = await fetch(`/api/admin/email${before ? `?before=${encodeURIComponent(before)}` : ""}`, action ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...data, action }) } : { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Email request failed.");
  return payload;
}
export default function EmailClient() {
  const [users, setUsers] = useState<EmailRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [preview, setPreview] = useState<{ draft: EmailDraft; recipients: EmailRecipient[] } | null>(null);
  const [viewing, setViewing] = useState<History | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const load = useCallback(async (initialize = false) => {
    const data = await api(); setUsers(data.users); setHistory(data.history); setHasMore(data.hasMore);
    if (initialize) { setSelected(data.users.map((user: EmailRecipient) => user.id)); setSignature(data.signature); }
    setReady(true);
  }, []);
  useEffect(() => { void load(true).catch(error => setNotice(error.message)); }, [load]);
  async function loadOlder() {
    setBusy("history");
    try { const data = await api(undefined, {}, history.at(-1)?.id); setHistory(current => [...current, ...data.history]); setHasMore(data.hasMore); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not load older emails."); }
    finally { setBusy(""); }
  }
  async function makePreview(event: React.FormEvent) {
    event.preventDefault(); setBusy("preview"); setNotice("");
    try { setPreview(await api("preview", { recipientIds: selected, subject, message, signature })); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not preview email."); }
    finally { setBusy(""); }
  }
  async function deliver(id: string) {
    let result;
    do { result = await api("deliver", { id }); } while (result.remaining > 0 && result.processed > 0);
    await load();
    setNotice(result.failed ? "Some emails could not be sent. Check history for delivery status." : result.remaining ? "Emails remain queued. Use Send pending in history to continue." : "Email processing finished. Check history for delivery status.");
  }
  async function send() {
    if (!preview) return;
    setBusy("send"); setNotice("");
    try { const saved = await api("send", preview.draft); setPreview(null); await load(); await deliver(saved.id); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not complete sending. Check history before retrying."); await load().catch(() => undefined); }
    finally { setBusy(""); }
  }
  async function saveSignature() {
    setBusy("signature"); try { await api("signature", { signature }); setNotice("Signature saved for future messages."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save signature."); }
    finally { setBusy(""); }
  }
  function reload(item: History) {
    setSubject(item.subject); setMessage(item.message); setSignature(item.signature);
    setSelected(item.recipients.filter(recipient => users.some(user => user.id === recipient.id)).map(recipient => recipient.id));
    setViewing(null); setPreview(null); setNotice("Loaded as a new draft. Review recipients and preview before sending.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return <>
    {notice && <div className="notice" role="status">{notice}</div>}
    {!ready ? <p>Loading email…</p> : <form className="email-compose" onSubmit={event => void makePreview(event)}>
      <fieldset disabled={Boolean(busy)}><legend>To ({selected.length})</legend>
        <p className="muted">Approved members and admins are selected by default. Each receives a separate email.</p>
        <div className="email-recipient-tools"><button className="button secondary small" type="button" onClick={() => setSelected(users.map(user => user.id))}>Select all</button><button className="button secondary small" type="button" onClick={() => setSelected([])}>Clear</button></div>
        <div className="email-recipients">{users.map(user => <label className="settings-check-label" key={user.id}><input type="checkbox" checked={selected.includes(user.id)} onChange={event => setSelected(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} /><span>{user.name} <span className="muted">({user.email})</span></span></label>)}</div>
      </fieldset>
      <label>Subject<input required maxLength={200} value={subject} onChange={event => setSubject(event.target.value)} disabled={Boolean(busy)} /></label>
      <label>Message<textarea required rows={9} maxLength={20000} value={message} onChange={event => setMessage(event.target.value)} disabled={Boolean(busy)} /></label>
      <label>Signature<textarea rows={3} maxLength={4000} value={signature} onChange={event => setSignature(event.target.value)} disabled={Boolean(busy)} /></label>
      <div className="form-actions"><button className="button secondary" type="button" disabled={Boolean(busy)} onClick={() => void saveSignature()}>Save signature</button><button className="button" disabled={Boolean(busy) || !selected.length}>Preview email</button></div>
      <p className="muted">The signature is shared by administrators and saved when you preview or select Save signature.</p>
    </form>}
    <section className="user-group"><h2>Email history</h2><button className="button secondary small" disabled={Boolean(busy)} onClick={() => void load().catch(error => setNotice(error.message))}>Refresh history</button>
      {!history.length ? <p className="muted">No emails sent yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Sent / queued</th><th>Subject</th><th>Recipients / delivery</th><th>Actions</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td data-label="Sent / queued">{new Date(item.createdAt).toLocaleString()}<br />{item.senderName}</td><td data-label="Subject">{item.subject}</td><td data-label="Recipients / delivery">{item.recipients.length} recipients<br />{Object.entries(item.delivery).map(([status, count]) => `${count} ${status.toLowerCase()}`).join(" · ")}</td><td className="action-cell" data-label="Actions"><div className="user-actions"><button className="button secondary small" disabled={Boolean(busy)} onClick={() => setViewing(item)}>View</button><button className="button secondary small" disabled={Boolean(busy)} onClick={() => reload(item)}>Reload as new</button>{(item.delivery.PENDING || 0) > 0 && <button className="button small" disabled={Boolean(busy)} onClick={async () => { setBusy("deliver"); try { await deliver(item.id); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send pending emails."); } finally { setBusy(""); } }}>Send pending</button>}</div></td></tr>)}</tbody></table></div>}
      {hasMore && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void loadOlder()}>Load older emails</button>}
    </section>
    {(preview || viewing) && <div className="modal-overlay"><section className="modal email-preview" role="dialog" aria-modal="true" aria-labelledby="email-preview-title"><h2 id="email-preview-title">{preview ? "Preview email" : "Email history"}</h2><p><strong>To:</strong> {(preview?.recipients || viewing!.recipients).map(user => `${user.name} (${user.email})`).join(", ")}</p><h3>Subject: {preview?.draft.subject || viewing!.subject}</h3><div className="email-message">{preview?.draft.message || viewing!.message}{(preview?.draft.signature || viewing?.signature) && <>{"\n\n"}{preview?.draft.signature || viewing?.signature}</>}</div><div className="form-actions">{preview ? <><button className="button secondary" disabled={Boolean(busy)} onClick={() => setPreview(null)}>Cancel</button><button className="button" disabled={Boolean(busy)} onClick={() => void send()}>{busy === "send" ? "Sending…" : `Send to ${preview.recipients.length} recipients`}</button></> : <><button className="button secondary" onClick={() => setViewing(null)}>Close</button><button className="button" disabled={Boolean(busy)} onClick={() => reload(viewing!)}>Reload as new</button></>}</div></section></div>}
  </>;
}
