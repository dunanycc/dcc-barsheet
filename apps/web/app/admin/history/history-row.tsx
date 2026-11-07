export type HistoryEntry = {
  id: string; operationId?: string; createdAt: string; actorName?: string; actorEmail?: string;
  targetName?: string; targetEmail?: string; eventName?: string; eventDate?: string; shiftTime?: string;
  description: string; summary: string; changes: { before: unknown; after: unknown }; reason?: string;
};

const FIELD_LABELS: Record<string, string> = {
  adminNotes: "Admin notes", displayTime: "Shift time", enteredName: "Volunteer", firstName: "First name",
  isLocked: "Locked", isOpen: "Open", isPrivate: "Private", lastName: "Last name", maxVols: "Volunteers per shift",
  method: "Authentication method", normalizedEmail: "Email", role: "Role", slotTimes: "Shift times", status: "Status",
};
const FRIENDLY_VALUES: Record<string, string> = {
  ACTIVE: "Active", ADMIN: "Admin", APPROVED: "Approved", CANCELLED: "Cancelled", DISABLED: "Disabled",
  EMAIL: "Approved email", EMAIL_ASSERTION: "Approved email", GOOGLE: "Google", YAHOO: "Yahoo", MEMBER: "Member", PENDING: "Pending",
  REJECTED: "Rejected", REMOVED: "Removed", REPLACED: "Replaced",
};

function friendlyDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function friendlyAuditValue(value: unknown): string {
  if (value === null || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(friendlyAuditValue).join(", ");
  if (typeof value === "string") return FRIENDLY_VALUES[value] || value;
  return String(value);
}

export function changedFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => item !== undefined && !/(^id$|Id$|Hash$|sourceKey$)/.test(key))
    .map(([key, item]) => ({ label: FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()), value: friendlyAuditValue(item) }));
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`history-detail${wide ? " wide" : ""}`}><dt>{label}</dt><dd>{value}</dd></div>;
}

export default function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const before = changedFields(entry.changes.before); const after = changedFields(entry.changes.after);
  const beforeText = before.map((item) => `${item.label}: ${item.value}`).join("; ");
  const afterText = after.map((item) => `${item.label}: ${item.value}`).join("; ");
  const target = [entry.targetName, entry.targetEmail].filter(Boolean).join(" · ");
  const hasUsefulDetails = Boolean(entry.actorEmail || target || entry.eventName || entry.eventDate || entry.shiftTime || entry.reason || beforeText || afterText);
  return <details className="history-entry">
    <summary className="history-summary-row">
      <time dateTime={entry.createdAt}>{friendlyDate(entry.createdAt)}</time>
      <strong className="history-actor">{entry.actorName || "System"}</strong>
      <span className="history-summary">{entry.summary}</span>
      <span className="history-details-label">Details</span>
    </summary>
    <div className="history-details-content">
      {hasUsefulDetails ? <dl className="history-detail-grid">
        {entry.actorEmail && <Detail label="Actor email" value={entry.actorEmail} />}
        {target && <Detail label="Target" value={target} />}
        {entry.eventName && <Detail label="Event" value={entry.eventName} />}
        {entry.eventDate && <Detail label="Event date" value={entry.eventDate} />}
        {entry.shiftTime && <Detail label="Shift" value={entry.shiftTime} />}
        {entry.reason && <Detail label="Reason" value={entry.reason} />}
        {beforeText && <Detail label="Before" value={beforeText} wide />}
        {afterText && <Detail label="After" value={afterText} wide />}
      </dl> : <p className="history-no-details">No additional administrative details.</p>}
    </div>
  </details>;
}
