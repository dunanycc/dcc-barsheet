import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "./route";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), users: vi.fn(), signature: vi.fn(), existing: vi.fn(), transaction: vi.fn(), deliver: vi.fn() }));
vi.mock("../../../../lib/authorization", () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock("../../../../lib/notification-processor", () => ({ deliverNewNotifications: mocks.deliver }));
vi.mock("../../../../lib/prisma", () => ({ default: { user: { findMany: mocks.users }, adminEmailSettings: { upsert: mocks.signature }, adminEmail: { findUnique: mocks.existing }, $transaction: mocks.transaction } }));
const draft = { id: "11111111-1111-4111-8111-111111111111", recipientIds: ["user1"], subject: "Update", message: "Hello", signature: "Club team" };
const request = (action: string, values: object = draft) => new NextRequest("http://localhost/api/admin/email", { method: "POST", body: JSON.stringify({ action, ...values }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin", firstName: "Club", lastName: "Admin", normalizedEmail: "admin@example.com" } });
  mocks.users.mockResolvedValue([{ id: "user1", firstName: "Test", lastName: "Member", normalizedEmail: "test@example.com" }]);
});
describe("admin email workflow", () => {
  it("denies non-admin reads and sends", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await GET()).status).toBe(403); expect((await POST(request("send"))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("preview saves the signature but never queues or sends email", async () => {
    const response = await POST(request("preview")); expect(response.status).toBe(200);
    expect((await response.json()).recipients).toEqual([{ id: "user1", name: "Test Member", email: "test@example.com" }]);
    expect(mocks.signature).toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
  });
  it("rejects recipients who are no longer eligible", async () => {
    mocks.users.mockResolvedValue([]);
    expect((await POST(request("send"))).status).toBe(400); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("repeated send of an existing preview creates no duplicate outbox rows", async () => {
    mocks.existing.mockResolvedValue({ id: draft.id });
    expect((await POST(request("send"))).status).toBe(200); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("stores immutable message and recipient snapshots with separate emails", async () => {
    const tx = { adminEmail: { create: vi.fn() }, notification: { createMany: vi.fn() }, auditEvent: { create: vi.fn() } };
    mocks.transaction.mockImplementation(async callback => callback(tx));
    expect((await POST(request("send"))).status).toBe(200);
    expect(tx.adminEmail.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: draft.id, subject: "Update", signature: "Club team", recipients: [{ id: "user1", name: "Test Member", email: "test@example.com" }] }) });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ recipientEmail: "test@example.com", operationId: draft.id, payload: expect.objectContaining({ adminComposed: true, signature: "Club team" }) })] });
    expect(mocks.deliver).not.toHaveBeenCalled();
  });
});
