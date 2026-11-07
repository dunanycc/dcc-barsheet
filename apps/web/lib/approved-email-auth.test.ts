import { describe, expect, it, vi } from "vitest";
import { ApprovedEmailDependencies, authorizeApprovedEmail } from "./approved-email-auth";
import { AccessUser } from "./auth-policy";

const base: AccessUser = { id: "user-1", email: "member@example.com", normalizedEmail: "member@example.com", firstName: "Club", lastName: "Member", status: "APPROVED", role: "MEMBER" };
function dependencies(user: (AccessUser & { hasLinkedGoogleIdentity: boolean; hasLinkedYahooIdentity: boolean }) | null) {
  const activate = vi.fn(async () => user!); const upsertEmailIdentity = vi.fn(async () => undefined); const recordRejected = vi.fn(async () => undefined);
  const value: ApprovedEmailDependencies = { findUser: vi.fn(async () => user), activate, upsertEmailIdentity, recordRejected };
  return { value, activate, upsertEmailIdentity, recordRejected };
}

describe("role-based approved-email policy", () => {
  for (const role of ["MEMBER", "ADMIN"] as const) {
    for (const email of ["member@gmail.com", "member@yahoo.ca", "member@example.com"]) {
      for (const linked of [false, true]) {
        it(`${role} ${email} linked=${linked}`, async () => {
          const mocks = dependencies({ ...base, role, email, normalizedEmail: email, hasLinkedGoogleIdentity: linked, hasLinkedYahooIdentity: linked });
          expect((await authorizeApprovedEmail(email, mocks.value)).kind).toBe(role === "ADMIN" ? "provider_required" : "authenticated");
          if (role === "ADMIN") {
            expect(mocks.activate).not.toHaveBeenCalled();
            expect(mocks.upsertEmailIdentity).not.toHaveBeenCalled();
          } else {
            expect(mocks.activate).toHaveBeenCalledWith(base.id);
            expect(mocks.upsertEmailIdentity).toHaveBeenCalledOnce();
          }
        });
      }
    }
  }
  it.each(["PENDING", "DISABLED", "REJECTED"] as const)("rejects %s", async (status) => {
    const mocks = dependencies({ ...base, status, hasLinkedGoogleIdentity: false, hasLinkedYahooIdentity: false });
    expect((await authorizeApprovedEmail(base.email, mocks.value)).kind).toBe("rejected");
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("rejects unknown users", async () => {
    expect((await authorizeApprovedEmail(base.email, dependencies(null).value)).kind).toBe("rejected");
  });
});
