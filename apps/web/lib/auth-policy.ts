export type AccessUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  firstName: string;
  lastName: string;
  status: "PENDING" | "APPROVED" | "ACTIVE" | "DISABLED" | "REJECTED";
  role: "MEMBER" | "ADMIN";
  hiddenAt?: Date | null;
};

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function isGoogleEmailDomain(normalizedEmail: string) {
  const domain = normalizedEmail.split("@").at(-1);
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function requiresGoogleAuthentication(normalizedEmail: string, hasLinkedGoogleIdentity: boolean) {
  return isGoogleEmailDomain(normalizedEmail) || hasLinkedGoogleIdentity;
}

export const YAHOO_AUTHENTICATION_DOMAINS = [
  "yahoo.com", "yahoo.ca", "yahoo.co.uk", "yahoo.fr", "yahoo.de",
  "yahoo.com.au", "yahoo.co.jp", "ymail.com", "rocketmail.com",
] as const;

export function isYahooEmailDomain(normalizedEmail: string) {
  const domain = normalizedEmail.split("@").at(-1);
  return YAHOO_AUTHENTICATION_DOMAINS.includes(domain as (typeof YAHOO_AUTHENTICATION_DOMAINS)[number]);
}

export function requiresYahooAuthentication(normalizedEmail: string, hasLinkedYahooIdentity: boolean) {
  return isYahooEmailDomain(normalizedEmail) || hasLinkedYahooIdentity;
}

export function isOperationalStatus(status: AccessUser["status"]) {
  return status === "APPROVED" || status === "ACTIVE";
}

export function canAuthenticate(user: AccessUser | null | undefined) {
  return Boolean(user && !user.hiddenAt && isOperationalStatus(user.status));
}

export function canAdminister(user: AccessUser | null | undefined) {
  return Boolean(user?.status === "ACTIVE" && user.role === "ADMIN");
}

export function canShowAdminLink(user: AccessUser | null | undefined) {
  return Boolean(user?.status === "ACTIVE" && user.role === "ADMIN");
}

export function assertLastAdminSafe(input: {
  targetIsActiveAdmin: boolean;
  activeAdminCount: number;
  removingAdmin: boolean;
}) {
  if (input.targetIsActiveAdmin && input.removingAdmin && input.activeAdminCount <= 1) {
    throw new Error("LAST_ACTIVE_ADMIN");
  }
}

export function displayName(user: Pick<AccessUser, "firstName" | "lastName">) {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function sessionUserLookup(userId: string) {
  return { id: userId } as const;
}

export function isDuplicatePending(status: string | null | undefined) {
  return status === "PENDING";
}

export function approvedUserState() {
  return { status: "APPROVED" as const, role: "MEMBER" as const };
}
