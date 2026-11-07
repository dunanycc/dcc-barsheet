import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { DELETE, GET } from "./route";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), findShift: vi.fn(), transaction: vi.fn(), notify: vi.fn(), deliver: vi.fn() }));
vi.mock("../../../../../lib/authorization", () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock("../../../../../lib/prisma", () => ({ default: { $transaction: mocks.transaction, shift: { findUnique: mocks.findShift } } }));
vi.mock("../../../../../lib/administrator-notifications", () => ({ queueAdministratorNotification: mocks.notify }));
vi.mock("../../../../../lib/notification-processor", () => ({ deliverNewNotifications: mocks.deliver }));
const context = { params: Promise.resolve({ shiftId: "shift-1" }) };
const request = () => new NextRequest("http://localhost/api/admin/shifts/shift-1", { method: "DELETE" });
beforeEach(() => vi.resetAllMocks());

describe("delete a time slot", () => {
  it("denies non-admins", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await DELETE(request(), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([true, false])("removes an open=%s slot, clears signup references, and preserves history", async isOpen => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin", firstName: "Club", lastName: "Admin", normalizedEmail: "admin@example.com" } });
    const assignment = { id: "assignment-1", status: "ACTIVE", userId: "member", volunteerProfileId: "profile", enteredName: "Test Member", user: { firstName: "Test", normalizedEmail: "member@example.com" } };
    const tx = {
      shift: { findUnique: vi.fn(async () => ({ id: "shift-1", eventId: "event", displayTime: "3pm-5pm", capacity: 2, isOpen, event: { id: "event", name: "Test Event", date: new Date("2027-10-09") }, assignments: [assignment] })), delete: vi.fn() },
      shiftAssignment: { updateMany: vi.fn(), deleteMany: vi.fn() }, auditEvent: { create: vi.fn() }, notification: { createMany: vi.fn() },
    };
    mocks.transaction.mockImplementation(async callback => callback(tx));
    expect((await DELETE(request(), context)).status).toBe(200);
    expect(tx.shift.delete).toHaveBeenCalledWith({ where: { id: "shift-1" } });
    expect(tx.shiftAssignment.updateMany).toHaveBeenCalledWith({ where: { replacedAssignmentId: { in: ["assignment-1"] } }, data: { replacedAssignmentId: null } });
    expect(tx.shiftAssignment.deleteMany).toHaveBeenCalledWith({ where: { shiftId: "shift-1" } });
    expect(tx.auditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "SHIFT_DELETE", previousData: expect.objectContaining({ isOpen, displayTime: "3pm-5pm", assignments: [expect.objectContaining({ enteredName: "Test Member" })] }) }) });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ recipientEmail: "member@example.com", type: "ASSIGNMENT_REMOVED" })] });
  });
  it("returns 404 for an already-deleted slot", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin" } });
    mocks.transaction.mockImplementation(async callback => callback({ shift: { findUnique: async () => null } }));
    expect((await DELETE(request(), context)).status).toBe(404);
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});

describe("shift-deletion notification preview", () => {
  it("lists current assigned names without duplicates", async () => {
    mocks.authorize.mockResolvedValue({ ok: true });
    mocks.findShift.mockResolvedValue({ assignments: [{ enteredName: "Jane Smith" }, { enteredName: "Alex Green" }, { enteredName: "Jane Smith" }] });
    const response = await GET(request(), context);
    expect(await response.json()).toEqual({ notificationNames: ["Jane Smith", "Alex Green"] });
    expect(mocks.findShift).toHaveBeenCalledWith(expect.objectContaining({ select: { assignments: { where: { status: "ACTIVE", userId: { not: null } }, select: { enteredName: true } } } }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("denies non-admin access to recipient names", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.findShift).not.toHaveBeenCalled();
  });
});
