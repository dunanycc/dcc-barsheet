export type HistoryCategory = "all" | "users" | "schedule" | "signins";

export const HISTORY_ACTIONS = {
  users: ["USER_ACTIVATED", "ACCESS_REQUESTED", "ACCESS_APPROVED", "ACCESS_REJECTED", "USER_DISABLED", "USER_ENABLED", "ADMIN_GRANTED", "ADMIN_REMOVED"],
  schedule: ["SIGNUP_ADD", "SIGNUP_REMOVE", "SIGNUP_REPLACE", "EVENT_CREATE", "EVENT_UPDATE", "EVENT_CANCEL", "EVENT_CLONE", "SHIFT_CREATE", "SHIFT_UPDATE", "SHIFT_CLOSE", "SCHEDULE_CLONED", "SCHEDULE_REPLACED", "SCHEDULE_YEAR_REMOVED", "SETTINGS_UPDATE"],
  signins: ["LOGIN_GOOGLE", "LOGIN_YAHOO", "LOGIN_EMAIL", "LOGIN_REJECTED"],
} as const;

export function actionsForCategory(category: string) {
  if (category === "users" || category === "schedule" || category === "signins") return [...HISTORY_ACTIONS[category]];
  return undefined;
}

export function buildHistoryFilter(category: string, userId: string, search: string, matchingUserIds: string[], matchingEventIds: string[] = []) {
  const and: Record<string, unknown>[] = [];
  const action = actionsForCategory(category);
  if (action) and.push({ action: { in: action } });
  if (userId) and.push({ OR: [{ actorUserId: userId }, { entityType: "User", entityId: userId }] });
  if (search) and.push({ OR: [
    { actorNameSnapshot: { contains: search, mode: "insensitive" } },
    { actorEmailSnapshot: { contains: search, mode: "insensitive" } },
    { actorUserId: { in: matchingUserIds } }, { entityType: "User", entityId: { in: matchingUserIds } },
    { eventId: { in: matchingEventIds } }, { entityType: "Event", entityId: { in: matchingEventIds } },
  ] });
  return and.length ? { AND: and } : {};
}

type DescriptionInput = {
  action: string;
  actorName?: string | null;
  targetName?: string | null;
  eventName?: string | null;
  shiftTime?: string | null;
  eventDate?: string | null;
  reason?: string | null;
};

export function describeAuditEvent(input: DescriptionInput) {
  const actor = input.actorName || "Someone";
  const target = input.targetName || "a volunteer";
  const event = input.eventName ? `the ${input.eventName} event` : "an event";
  const shift = [input.eventDate, input.shiftTime].filter(Boolean).join(", ") || "a time slot";
  const scheduleSlot = [input.eventName, input.eventDate, input.shiftTime].filter(Boolean).join(" · ") || "a time slot";
  const descriptions: Record<string, string> = {
    LOGIN_GOOGLE: `${actor} signed in with Google`, LOGIN_YAHOO: `${actor} signed in with Yahoo`, LOGIN_EMAIL: `${actor} signed in with email`,
    LOGIN_REJECTED: `A sign-in attempt was rejected`, USER_ACTIVATED: `${target} activated their account`,
    ACCESS_REQUESTED: `${target} requested access`, ACCESS_APPROVED: `${actor} approved access for ${target}`,
    ACCESS_REJECTED: `${actor} rejected access for ${target}`, USER_DISABLED: `${actor} disabled ${target}`,
    USER_ENABLED: `${actor} re-enabled ${target}`, ADMIN_GRANTED: `${actor} granted administrator access to ${target}`,
    ADMIN_REMOVED: `${actor} removed administrator access from ${target}`,
    SIGNUP_ADD: actor === target ? `${target} signed up for ${scheduleSlot}` : `${actor} signed up ${target} for ${scheduleSlot}`, SIGNUP_REMOVE: `${actor} removed ${target} from ${scheduleSlot}`,
    SIGNUP_REPLACE: `${actor} replaced ${target} for ${scheduleSlot}`, EVENT_CREATE: `${actor} created ${event}`,
    EVENT_UPDATE: `${actor} updated ${event}`, EVENT_CANCEL: `${actor} cancelled ${event}`,
    EVENT_CLONE: `${actor} cloned ${event}`, SHIFT_CREATE: `${actor} added ${shift} to ${event}`,
    SHIFT_UPDATE: `${actor} updated ${shift} for ${event}`, SHIFT_CLOSE: `${actor} closed ${shift} for ${event}`,
    SCHEDULE_CLONED: `${actor} created a new schedule year`, SCHEDULE_REPLACED: `${actor} imported and replaced the schedule`,
    SCHEDULE_YEAR_REMOVED: `${actor} removed a schedule year`,
    SETTINGS_UPDATE: `${actor} updated notification settings`, BOOTSTRAP_ADMIN: `${target} was configured as an administrator`,
    TEST_EMAIL_SENT: `${actor} sent a staging test email`, TEST_EMAIL_FAILED: `${actor} attempted a staging test email`,
    NOTIFICATION_RETRY: `${actor} queued an email for retry`, NOTIFICATION_PROCESS_RUN: `${actor} processed queued email notifications`,
    ADMIN_NOTIFICATION_EMAIL_CHANGED: `${actor} changed administrator notification email`,
    VOLUNTEER_IMPORT_APPLIED: `${actor} imported approved volunteers`,
    VOLUNTEER_PROFILE_UPDATED: `${actor} changed a volunteer profile name`, PARTNER_ADDED: `${actor} added a partner profile`, PARTNER_DEACTIVATED: `${actor} deactivated a partner profile`,
    USER_EMAIL_CHANGED: `${actor} changed an account email`, USER_PROFILE_ADMIN_UPDATED: `${actor} updated a volunteer profile`,
  };
  return descriptions[input.action] || `${actor} performed ${input.action.toLowerCase().replaceAll("_", " ")}`;
}

export function compactAuditSummary(description: string, actorName?: string | null) {
  const prefix = actorName ? `${actorName} ` : "";
  const summary = prefix && description.startsWith(prefix) ? description.slice(prefix.length) : description;
  return summary ? summary.charAt(0).toUpperCase() + summary.slice(1) : "Activity recorded";
}
