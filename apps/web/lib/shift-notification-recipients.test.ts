import { describe, expect, it, vi } from "vitest";
import { shiftNotificationRecipients } from "./shift-notification-recipients";
const user = { firstName: "Jayem", normalizedEmail: "jayem@example.com" };
describe("shift notification recipients", () => {
  it("resolves a name-only admin signup to its approved profile", async () => {
    const result = await shiftNotificationRecipients([{ enteredName: "Jayem Nolan", status: "ACTIVE", user: null }], async () => [{ firstName: "Jayem", lastName: "Nolan", user }]);
    expect(result).toEqual({ recipients: [user], notificationNames: ["Jayem Nolan"], unmatchedNames: [] });
  });
  it("uses a linked partner's account and deduplicates emails", async () => {
    const find = vi.fn();
    const result = await shiftNotificationRecipients([{ enteredName: "Partner Nolan", volunteerProfile: { user } }, { enteredName: "Jayem Nolan", user }], find);
    expect(result.recipients).toEqual([user]);
    expect(result.notificationNames).toEqual(["Partner Nolan", "Jayem Nolan"]);
    expect(find).not.toHaveBeenCalled();
  });
  it("does not guess between accounts sharing a name", async () => {
    const result = await shiftNotificationRecipients([{ enteredName: "Jane Smith" }], async () => [{ firstName: "Jane", lastName: "Smith", user }, { firstName: "Jane", lastName: "Smith", user: { ...user, normalizedEmail: "other@example.com" } }]);
    expect(result.recipients).toEqual([]);
    expect(result.unmatchedNames).toEqual(["Jane Smith"]);
  });
  it("normalizes case and spacing in name-only signups", async () => {
    const result = await shiftNotificationRecipients([{ enteredName: " JAYEM  Nolan " }], async () => [{ firstName: "Jayem", lastName: "Nolan", user }]);
    expect(result.recipients).toEqual([user]);
  });
  it("excludes removed signups", async () => {
    expect((await shiftNotificationRecipients([{ enteredName: "Jayem Nolan", status: "REMOVED", user }], async () => [])).recipients).toEqual([]);
  });
});
