import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HistoryRow, { changedFields, friendlyAuditValue, HistoryEntry } from "./history-row";

const entry: HistoryEntry = {
  id: "audit-1", operationId: "operation-1", createdAt: "2026-08-21T21:42:00.000Z",
  actorName: "Donkey Test", actorEmail: "donkey@example.com", targetName: "Donkey Test",
  eventName: "Pizza party", eventDate: "2026-08-28", shiftTime: "5pm–7pm",
  description: "Donkey Test signed up for 2026-08-28, 5pm–7pm", summary: "Signed up for 2026-08-28, 5pm–7pm",
  changes: { before: { status: "ACTIVE", role: "MEMBER", userId: "internal-1" }, after: { status: "ACTIVE", role: "ADMIN", method: "EMAIL_ASSERTION" } },
};

describe("compact history row", () => {
  const markup = renderToStaticMarkup(<HistoryRow entry={entry} />);
  it("renders one compact actor and action summary", () => {
    expect(markup).toContain("Donkey Test"); expect(markup).toContain("Signed up for");
    expect(markup).not.toContain("Actor:");
  });
  it("keeps additional information inside Details", () => {
    expect(markup).toContain('class="history-summary-row"');
    expect(markup).toContain('class="history-details-content"');
    expect(markup).toContain("Actor email"); expect(markup).toContain("Before"); expect(markup).toContain("After");
  });
  it("does not render technical operation or internal database IDs", () => {
    expect(markup).not.toContain("operation-1"); expect(markup).not.toContain("internal-1"); expect(markup).not.toContain("Operation:");
  });
  it("formats administrator-facing fields and values", () => {
    expect(friendlyAuditValue("EMAIL_ASSERTION")).toBe("Approved email");
    expect(friendlyAuditValue("ADMIN")).toBe("Admin");
    expect(changedFields({ method: "GOOGLE", isLocked: true })).toEqual([
      { label: "Authentication method", value: "Google" }, { label: "Locked", value: "Yes" },
    ]);
    expect(markup).toContain("Role: Member"); expect(markup).toContain("Role: Admin"); expect(markup).toContain("Authentication method: Approved email");
  });
});
