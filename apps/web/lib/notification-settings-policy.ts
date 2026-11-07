import { AccessUser, normalizeEmail } from "./auth-policy";

export function canManageNotificationSettings(user: AccessUser | null | undefined) {
  return Boolean(user?.status === "ACTIVE" && user.role === "ADMIN");
}

export function normalizeOptionalNotificationEmail(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("INVALID_NOTIFICATION_EMAIL");
  const email = normalizeEmail(value);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_NOTIFICATION_EMAIL");
  return email;
}
