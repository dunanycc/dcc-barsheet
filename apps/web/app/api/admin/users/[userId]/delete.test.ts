import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { DELETE, PATCH } from "./route";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), transaction: vi.fn(), remove: vi.fn() }));
vi.mock("../../../../../lib/authorization", () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock("../../../../../lib/prisma", () => ({ default: { $transaction: mocks.transaction } }));
vi.mock("../../../../../lib/delete-hidden-user", () => ({ deleteHiddenUser: mocks.remove, UserDeletionError: class extends Error {} }));
const context = { params: Promise.resolve({ userId: "test-user" }) };
function request(body: object) { return new NextRequest("http://localhost/api/admin/users/test-user", { method: "DELETE", body: JSON.stringify(body) }); }
beforeEach(() => vi.resetAllMocks());

describe("hidden user DELETE boundary", () => {
  it("denies non-admin callers before any transaction", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await DELETE(request({ confirmUserId: "test-user" }), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires confirmation of the exact user", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin" } });
    expect((await DELETE(request({ confirmUserId: "other" }), context)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("runs confirmed deletion in a serializable transaction", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin" } });
    const tx = {};
    mocks.transaction.mockImplementation(async callback => callback(tx));
    expect((await DELETE(request({ confirmUserId: "test-user" }), context)).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(tx, "test-user", "admin");
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable", maxWait: 5000, timeout: 30000 });
  });
});

describe("Admin checkbox account edits", () => {
  function txFor(role: string, activeAdmins = 2) {
    const user = { id: "test-user", firstName: "Test", lastName: "User", normalizedEmail: "test@example.com", role, status: "ACTIVE", hiddenAt: null };
    return { user: { findUnique: vi.fn(async () => user), count: vi.fn(async () => activeAdmins), findFirst: vi.fn(async () => null), update: vi.fn(), findUniqueOrThrow: vi.fn(async () => user) }, volunteerProfile: { findFirstOrThrow: vi.fn(async () => ({ id: "profile" })), findFirst: vi.fn(async () => null), update: vi.fn() }, auditEvent: { create: vi.fn() } };
  }
  function edit(isAdmin: boolean) { return new NextRequest("http://localhost/api/admin/users/test-user", { method: "PATCH", body: JSON.stringify({ action: "update_account", firstName: "Test", lastName: "User", email: "test@example.com", isAdmin }) }); }
  it("rejects demoting the last admin before saving profile changes", async () => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin" } });
    const tx = txFor("ADMIN", 1);
    mocks.transaction.mockImplementation(async callback => callback(tx));
    expect((await PATCH(edit(false), context)).status).toBe(409);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it.each([["MEMBER", true, "ADMIN", "ADMIN_GRANTED"], ["ADMIN", false, "MEMBER", "ADMIN_REMOVED"]])("saves role edits and records history", async (role, isAdmin, expectedRole, action) => {
    mocks.authorize.mockResolvedValue({ ok: true, user: { id: "admin", firstName: "Club", lastName: "Admin", normalizedEmail: "admin@example.com" } });
    const tx = txFor(role as string);
    mocks.transaction.mockImplementation(async callback => callback(tx));
    expect((await PATCH(edit(isAdmin as boolean), context)).status).toBe(200);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: expectedRole, authVersion: { increment: 1 } }) }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action }) }));
  });
});
