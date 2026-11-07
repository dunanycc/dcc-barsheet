const escapeHtml = (value: string) => value.replace(/[&<>"\']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" })[c]!);
export type EmailRecipient = { id: string; name: string; email: string };
export type EmailDraft = { id: string; recipientIds: string[]; subject: string; message: string; signature: string };
export class EmailDraftError extends Error {}
export function validateEmailDraft(body: unknown): EmailDraft {
  if (!body || typeof body !== "object") throw new EmailDraftError("Enter an email draft.");
  const draft = body as Record<string, unknown>;
  if (typeof draft.id !== "string" || !/^[0-9a-f-]{36}$/i.test(draft.id)) throw new EmailDraftError("Preview your message before sending.");
  if (!Array.isArray(draft.recipientIds) || !draft.recipientIds.length || draft.recipientIds.length > 1000 || !draft.recipientIds.every(id => typeof id === "string" && id.length < 100)) throw new EmailDraftError("Select at least one recipient (maximum 1,000).");
  const subject = typeof draft.subject === "string" ? draft.subject.trim() : "";
  const message = typeof draft.message === "string" ? draft.message.trim() : "";
  const signature = typeof draft.signature === "string" ? draft.signature.trim() : "";
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new EmailDraftError("Enter a subject of 1–200 characters on one line.");
  if (!message || message.length > 20000 || signature.length > 4000) throw new EmailDraftError("Enter a message (maximum 20,000 characters) and a signature of at most 4,000 characters.");
  return { id: draft.id, recipientIds: [...new Set(draft.recipientIds)] as string[], subject, message, signature };
}
export function renderAdminEmail(draft: Pick<EmailDraft, "subject" | "message" | "signature">) {
  const text = [draft.message, draft.signature].filter(Boolean).join("\n\n");
  return { subject: draft.subject, text, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#183c25;white-space:pre-wrap">${escapeHtml(text)}</div>` };
}
