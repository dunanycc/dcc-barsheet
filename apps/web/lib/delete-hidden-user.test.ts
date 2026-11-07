import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../app/generated/prisma/client";
import { deleteHiddenUser } from "./delete-hidden-user";

function database(target: Record<string, unknown> | null) {
  const model = () => ({ findMany: vi.fn(async () => []), deleteMany: vi.fn(), updateMany: vi.fn() });
  return {
    user: { ...model(), findUnique: vi.fn(async () => target), count: vi.fn(async () => 0), delete: vi.fn() },
    volunteerProfile: model(), shiftAssignment: model(), accessRequest: model(),
    accessRequestAttempt: model(), externalIdentity: model(), auditEvent: model(), $executeRaw: vi.fn(), $queryRaw: vi.fn(),
  };
}
const hidden = { id: "test-user", normalizedEmail: "test@example.com", role: "MEMBER", status: "DISABLED", hiddenAt: new Date() };

describe("permanent hidden user deletion", () => {
  it.each([
    [null, "NOT_FOUND"], [{ ...hidden, hiddenAt: null }, "NOT_HIDDEN"],
    [{ ...hidden, id: "admin" }, "SELF_DELETE"],
    [{ ...hidden, role: "ADMIN", status: "ACTIVE" }, "LAST_ACTIVE_ADMIN"],
  ])("rejects unsafe deletion: %s", async (target, error) => {
    const tx = database(target);
    await expect(deleteHiddenUser(tx as unknown as Prisma.TransactionClient, "test-user", "admin")).rejects.toThrow(error as string);
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it("removes the hidden account and history while retaining other users' records", async () => {
    const tx = database(hidden);
    await deleteHiddenUser(tx as unknown as Prisma.TransactionClient, hidden.id, "admin");
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: hidden.id } });
    expect(tx.externalIdentity.deleteMany).toHaveBeenCalledWith({ where: { userId: hidden.id } });
    expect(tx.volunteerProfile.deleteMany).toHaveBeenCalledWith({ where: { userId: hidden.id } });
    expect(tx.shiftAssignment.updateMany).toHaveBeenCalledWith({ where: { createdByUserId: hidden.id }, data: { createdByUserId: null } });
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { approvedByUserId: hidden.id }, data: { approvedByUserId: null } });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
