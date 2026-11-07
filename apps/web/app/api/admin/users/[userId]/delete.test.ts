import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { DELETE } from "./route";

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
