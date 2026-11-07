import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionsForCategory, buildHistoryFilter, compactAuditSummary, describeAuditEvent } from "./audit-history";
import { assertLastAdminSafe, canAdminister, canShowAdminLink } from "./auth-policy";

const active = { id: "user-1", email: "member@example.com", normalizedEmail: "member@example.com", firstName: "Jane", lastName: "Member", status: "ACTIVE" as const, role: "MEMBER" as const };

describe("history authorization policy", () => {
  it("allows an active ADMIN", () => expect(canAdminister({ ...active, role: "ADMIN" })).toBe(true));
  it("denies a MEMBER", () => expect(canAdminister(active)).toBe(false));
  it("denies an anonymous user", () => expect(canAdminister(null)).toBe(false));
  it("shows the Admin action only to an active ADMIN", () => {
    expect(canShowAdminLink({ ...active, role: "ADMIN" })).toBe(true);
    expect(canShowAdminLink(active)).toBe(false);
    expect(canShowAdminLink({ ...active, role: "ADMIN", status: "APPROVED" })).toBe(false);
    expect(canShowAdminLink(null)).toBe(false);
  });
  it("retains last-admin protection", () => expect(() => assertLastAdminSafe({ targetIsActiveAdmin: true, activeAdminCount: 1, removingAdmin: true })).toThrow("LAST_ACTIVE_ADMIN"));
});

describe("history filters and descriptions", () => {
  it("limits category filters to the expected actions", () => {
    expect(actionsForCategory("signins")).toEqual(["LOGIN_GOOGLE", "LOGIN_YAHOO", "LOGIN_EMAIL", "LOGIN_REJECTED"]);
    expect(actionsForCategory("schedule")).toContain("SIGNUP_REPLACE");
    expect(actionsForCategory("users")).toContain("ACCESS_APPROVED");
  });
  it("filters a selected user as actor or target", () => expect(buildHistoryFilter("all", "user-7", "", [])).toEqual({ AND: [{ OR: [{ actorUserId: "user-7" }, { entityType: "User", entityId: "user-7" }] }] }));
  it("filters person searches by snapshots and matching user ids", () => expect(JSON.stringify(buildHistoryFilter("all", "", "jane", ["user-7"]))).toContain("actorEmailSnapshot"));
  it("creates friendly descriptions", () => expect(describeAuditEvent({ action: "ACCESS_APPROVED", actorName: "Jayem Nolan", targetName: "Jane Smith" })).toBe("Jayem Nolan approved access for Jane Smith"));
  it("removes the duplicate actor from compact summaries", () => expect(compactAuditSummary("Jayem Nolan signed in with Google", "Jayem Nolan")).toBe("Signed in with Google"));
  it("describes Yahoo sign-in without provider identifiers", () => expect(describeAuditEvent({ action: "LOGIN_YAHOO", actorName: "Jayem Nolan" })).toBe("Jayem Nolan signed in with Yahoo"));
});

describe("history API surface and mutation audit coverage", () => {
  const historyRoute = readFileSync("app/api/admin/history/route.ts", "utf8");
  const volunteerPage = readFileSync("app/page.tsx", "utf8");
  const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
  it("keeps anonymous volunteer and Admin pages protected server-side", () => {
    expect(volunteerPage).toContain('redirect("/sign-in")');
    expect(adminLayout).toContain("requireAdmin()");
  });
  it("has a read-only ADMIN-authorized API", () => {
    expect(historyRoute).toContain("authorizeAdminRequest");
    expect(historyRoute).toContain("export async function GET");
    expect(historyRoute).not.toMatch(/export async function (PATCH|POST|PUT|DELETE)/);
  });
  it.each([
    ["app/api/admin/events/route.ts", "EVENT_CREATE"], ["app/api/admin/events/[eventId]/route.ts", "EVENT_UPDATE"],
    ["app/api/admin/events/[eventId]/clone/route.ts", "EVENT_CLONE"], ["app/api/admin/events/[eventId]/shifts/route.ts", "SHIFT_CREATE"],
    ["app/api/admin/shifts/[shiftId]/route.ts", "SHIFT_UPDATE"],
    ["app/api/admin/schedule/clone-year/route.ts", "SCHEDULE_CLONED"],
  ])("records %s as %s", (file, action) => expect(readFileSync(file, "utf8")).toContain(`action: "${action}"`));
  it("audits both general settings and administrator notification email changes", () => {
    const source = readFileSync("app/api/admin/settings/route.ts", "utf8");
    expect(source).toContain('"SETTINGS_UPDATE"'); expect(source).toContain('"ADMIN_NOTIFICATION_EMAIL_CHANGED"');
  });
});
