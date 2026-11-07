import { type AccessUser, canAuthenticate, normalizeEmail } from "./auth-policy";

export type ExternalIdentityDecision =
  | { kind: "accepted"; email: string; user: AccessUser }
  | { kind: "rejected"; email: string | null }
  | { kind: "identity_conflict"; email: string };

export function evaluateExternalIdentitySignIn(input: {
  rawEmail: string;
  emailVerified: boolean;
  user: AccessUser | null;
  existingIdentityUserId?: string | null;
}): ExternalIdentityDecision {
  const email = normalizeEmail(input.rawEmail);
  if (!email || !input.emailVerified || !input.user || !canAuthenticate(input.user)) {
    return { kind: "rejected", email: email || null };
  }
  if (input.existingIdentityUserId && input.existingIdentityUserId !== input.user.id) {
    return { kind: "identity_conflict", email };
  }
  return { kind: "accepted", email, user: input.user };
}
