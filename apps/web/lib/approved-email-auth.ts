import { AccessUser, canAuthenticate, displayName, normalizeEmail } from "./auth-policy";

type ApprovedEmailUser = AccessUser & { hasLinkedGoogleIdentity: boolean; hasLinkedYahooIdentity: boolean };
type ActivatedUser = AccessUser;
export type ApprovedEmailResult =
  | { kind: "authenticated"; user: { id: string; email: string; name: string } }
  | { kind: "provider_required" }
  | { kind: "rejected" };

export type ApprovedEmailDependencies = {
  findUser(email: string): Promise<ApprovedEmailUser | null>;
  activate(userId: string): Promise<ActivatedUser>;
  upsertEmailIdentity(user: ActivatedUser): Promise<void>;
  recordRejected(email: string | null, method: string): Promise<void>;
};

export async function authorizeApprovedEmail(rawEmail: string, dependencies: ApprovedEmailDependencies): Promise<ApprovedEmailResult> {
  const email = normalizeEmail(rawEmail);
  const user = email ? await dependencies.findUser(email) : null;
  if (!user || !canAuthenticate(user)) {
    await dependencies.recordRejected(email || null, "EMAIL_ASSERTION");
    return { kind: "rejected" };
  }
  if (user.role === "ADMIN") {
    await dependencies.recordRejected(email, "EMAIL_ASSERTION_PROVIDER_REQUIRED");
    return { kind: "provider_required" };
  }
  const activated = await dependencies.activate(user.id);
  await dependencies.upsertEmailIdentity(activated);
  return { kind: "authenticated", user: { id: activated.id, email: activated.normalizedEmail, name: displayName(activated) } };
}
