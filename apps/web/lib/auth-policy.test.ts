import { describe, expect, it } from "vitest";
import {
  approvedUserState,
  assertLastAdminSafe,
  canAdminister,
  canAuthenticate,
  isDuplicatePending,
  isGoogleEmailDomain,
  isYahooEmailDomain,
  normalizeEmail,
  requiresGoogleAuthentication,
  requiresYahooAuthentication,
  sessionUserLookup,
  type AccessUser,
} from "./auth-policy";

const member: AccessUser = {
  id: "member-1", email: "Member@Example.com", normalizedEmail: "member@example.com",
  firstName: "Club", lastName: "Member", status: "ACTIVE", role: "MEMBER",
};

describe("authentication and authorization policy", () => {
  it("normalizes email consistently", () => {
    expect(normalizeEmail("  MEMBER@Example.COM  ")).toBe("member@example.com");
  });
  it("requires Google for Gmail, Googlemail, or an existing linked identity", () => {
    expect(isGoogleEmailDomain("member@gmail.com")).toBe(true);
    expect(isGoogleEmailDomain("member@googlemail.com")).toBe(true);
    expect(requiresGoogleAuthentication("member@example.com", true)).toBe(true);
    expect(requiresGoogleAuthentication("member@example.com", false)).toBe(false);
  });
  it("recognizes the explicitly supported Yahoo authentication domains", () => {
    for (const domain of ["yahoo.com", "yahoo.ca", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.com.au", "yahoo.co.jp", "ymail.com", "rocketmail.com"]) {
      expect(isYahooEmailDomain(`member@${domain}`)).toBe(true);
    }
    expect(isYahooEmailDomain("member@example.com")).toBe(false);
    expect(requiresYahooAuthentication("member@example.com", true)).toBe(true);
  });
  it("accepts approved users", () => expect(canAuthenticate({ ...member, status: "APPROVED" })).toBe(true));
  it("accepts active users", () => expect(canAuthenticate(member)).toBe(true));
  it("rejects an unknown user", () => expect(canAuthenticate(null)).toBe(false));
  it("rejects a disabled user", () => expect(canAuthenticate({ ...member, status: "DISABLED" })).toBe(false));
  it("authorizes active admins", () => expect(canAdminister({ ...member, role: "ADMIN" })).toBe(true));
  it("denies an approved but inactive admin", () => expect(canAdminister({ ...member, role: "ADMIN", status: "APPROVED" })).toBe(false));
  it("denies a member admin authorization", () => expect(canAdminister(member)).toBe(false));
  it("protects the last active administrator", () => {
    expect(() => assertLastAdminSafe({ targetIsActiveAdmin: true, activeAdminCount: 1, removingAdmin: true })).toThrow("LAST_ACTIVE_ADMIN");
  });
  it("allows an admin change when another active admin exists", () => {
    expect(() => assertLastAdminSafe({ targetIsActiveAdmin: true, activeAdminCount: 2, removingAdmin: true })).not.toThrow();
  });
  it("detects a duplicate pending request", () => expect(isDuplicatePending("PENDING")).toBe(true));
  it("defines approval as approved member access", () => expect(approvedUserState()).toEqual({ status: "APPROVED", role: "MEMBER" }));
  it("selects session identity only by the signed session user id", () => {
    const browserSuppliedEmail = "someone-else@example.com";
    expect(sessionUserLookup(member.id)).toEqual({ id: "member-1" });
    expect(sessionUserLookup(member.id)).not.toHaveProperty("email", browserSuppliedEmail);
  });
});
