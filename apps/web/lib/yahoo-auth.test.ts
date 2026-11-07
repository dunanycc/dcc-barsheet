import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { authorizeApprovedEmail, type ApprovedEmailDependencies } from "./approved-email-auth";
import { evaluateExternalIdentitySignIn } from "./external-identity-auth";
import { Yahoo } from "./yahoo-provider";
import type { AccessUser } from "./auth-policy";

const approved: AccessUser = { id: "user-1", email: "member@yahoo.ca", normalizedEmail: "member@yahoo.ca", firstName: "Club", lastName: "Member", status: "APPROVED", role: "MEMBER" };

describe("Yahoo authentication", () => {
  it("registers a secure OIDC provider with email and profile scopes", () => {
    const provider = Yahoo({ clientId: "client", clientSecret: "secret" });
    expect(provider).toMatchObject({ id: "yahoo", type: "oidc", issuer: "https://api.login.yahoo.com", client: { token_endpoint_auth_method: "client_secret_post" }, checks: ["pkce", "state", "nonce"] });
    expect(provider.authorization).toMatchObject({ params: { scope: "openid email profile" } });
  });

  it("accepts an approved user only with a verified Yahoo email", () => {
    expect(evaluateExternalIdentitySignIn({ rawEmail: " MEMBER@YAHOO.CA ", emailVerified: true, user: approved })).toMatchObject({ kind: "accepted", email: "member@yahoo.ca" });
    expect(evaluateExternalIdentitySignIn({ rawEmail: approved.email, emailVerified: false, user: approved }).kind).toBe("rejected");
  });

  it("rejects unknown and disabled Yahoo users", () => {
    expect(evaluateExternalIdentitySignIn({ rawEmail: "unknown@yahoo.com", emailVerified: true, user: null }).kind).toBe("rejected");
    expect(evaluateExternalIdentitySignIn({ rawEmail: approved.email, emailVerified: true, user: { ...approved, status: "DISABLED" } }).kind).toBe("rejected");
  });

  it("never permits a Yahoo provider identity to move to another user", () => {
    expect(evaluateExternalIdentitySignIn({ rawEmail: approved.email, emailVerified: true, user: approved, existingIdentityUserId: "other-user" }).kind).toBe("identity_conflict");
    const source = readFileSync("auth.ts", "utf8");
    expect(source).toContain("provider_providerAccountId");
    expect(source).toContain("providerAccountId: account.providerAccountId");
    expect(source).toContain("provider: method");
  });

  it("allows members to use approved email regardless of provider", async () => {
    const run = async (user: AccessUser & { hasLinkedGoogleIdentity: boolean; hasLinkedYahooIdentity: boolean }) => {
      const dependencies: ApprovedEmailDependencies = { findUser: vi.fn(async () => user), activate: vi.fn(async () => user), upsertEmailIdentity: vi.fn(), recordRejected: vi.fn() };
      return authorizeApprovedEmail(user.email, dependencies);
    };
    expect((await run({ ...approved, hasLinkedGoogleIdentity: false, hasLinkedYahooIdentity: false })).kind).toBe("authenticated");
    expect((await run({ ...approved, email: "member@example.com", normalizedEmail: "member@example.com", hasLinkedGoogleIdentity: false, hasLinkedYahooIdentity: true })).kind).toBe("authenticated");
    expect((await run({ ...approved, email: "member@example.com", normalizedEmail: "member@example.com", hasLinkedGoogleIdentity: false, hasLinkedYahooIdentity: false })).kind).toBe("authenticated");
  });

  it("keeps Google first and adds Yahoo to the sign-in UI", () => {
    const source = readFileSync("app/sign-in/sign-in-client.tsx", "utf8");
    expect(source.indexOf("Continue with Google")).toBeLessThan(source.indexOf("Continue with Yahoo"));
    expect(source).toContain('signIn("yahoo"');
  });

  it("returns rejected Yahoo OAuth users to a friendly sign-in message", () => {
    const auth = readFileSync("auth.ts", "utf8");
    const page = readFileSync("app/sign-in/page.tsx", "utf8");
    expect(auth).toContain('"/sign-in?error=yahoo_not_authorized"');
    expect(page).toContain("This Yahoo account is not authorized to use the DCC Bar Schedule");
  });
});
