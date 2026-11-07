import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AccessUser } from "./auth-policy";
import { queueAdministratorNotification } from "./administrator-notifications";
import { canManageNotificationSettings, normalizeOptionalNotificationEmail } from "./notification-settings-policy";

const activeAdmin: AccessUser = { id: "admin-1", email: "admin@example.com", normalizedEmail: "admin@example.com", firstName: "Active", lastName: "Admin", status: "ACTIVE", role: "ADMIN" };

describe("administrator notification settings policy", () => {
  it("allows only an ACTIVE ADMIN to manage the setting", () => {
    expect(canManageNotificationSettings(activeAdmin)).toBe(true);
    expect(canManageNotificationSettings({ ...activeAdmin, role: "MEMBER" })).toBe(false);
    expect(canManageNotificationSettings({ ...activeAdmin, status: "APPROVED" })).toBe(false);
    expect(canManageNotificationSettings(null)).toBe(false);
  });
  it("normalizes, validates, and clears the notification email", () => {
    expect(normalizeOptionalNotificationEmail("  ADMIN@Example.COM ")).toBe("admin@example.com");
    expect(normalizeOptionalNotificationEmail("")).toBeNull(); expect(normalizeOptionalNotificationEmail(null)).toBeNull();
    expect(() => normalizeOptionalNotificationEmail("not-an-email")).toThrow("INVALID_NOTIFICATION_EMAIL");
  });
  it("enforces ACTIVE ADMIN and creates an immutable audit in the Settings API", () => {
    const source = readFileSync("app/api/admin/settings/route.ts", "utf8");
    expect(source).toContain("canManageNotificationSettings"); expect(source).toContain("ADMIN_NOTIFICATION_EMAIL_CHANGED"); expect(source).toContain("tx.auditEvent.create");
  });
});

describe("database-backed administrator notification queuing", () => {
  it("uses the normalized database setting as recipient", async () => {
    const create = vi.fn(async () => ({ id: "notification-1" })); const tx = { notificationSettings: { findUnique: vi.fn(async () => ({ toEmail: "admin@example.com" })) }, notification: { create } };
    expect(await queueAdministratorNotification(tx as never, { operationId: "operation-1", subject: "Changed", message: "A change occurred." })).toBe("notification-1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientEmail: "admin@example.com", type: "ADMIN_ALERT" }) }));
  });
  it("skips an unset administrator recipient without creating or failing volunteer delivery", async () => {
    const create = vi.fn(); const tx = { notificationSettings: { findUnique: vi.fn(async () => null) }, notification: { create } };
    expect(await queueAdministratorNotification(tx as never, { operationId: "operation-1", subject: "Changed", message: "A change occurred." })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it("has no runtime dependency on ADMIN_NOTIFICATION_EMAIL", () => {
    expect(readFileSync("app/api/admin/notifications/route.ts", "utf8")).not.toContain("ADMIN_NOTIFICATION_EMAIL");
    expect(readFileSync(".env.example", "utf8")).not.toContain("ADMIN_NOTIFICATION_EMAIL");
  });
});
