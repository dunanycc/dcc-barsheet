const BARSHEET_URL = "https://dcc-barsheet.vercel.app";
export function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!); }
type Payload = Record<string, unknown>;
export type RenderedEmail = { subject: string; text: string; html: string };
function string(payload: Payload, key: string, fallback = "") { return typeof payload[key] === "string" ? payload[key] as string : fallback; }
function layout(title: string, greeting: string, paragraphs: string[], facts: Array<[string, string]> = []): RenderedEmail {
  const text = [greeting, "", ...paragraphs, ...(facts.length ? ["", ...facts.map(([label, value]) => `${label}: ${value}`)] : []), "", `Open DCC Bar Schedule: ${BARSHEET_URL}`, "", "DCC Bar Schedule"].join("\n");
  const htmlFacts = facts.length ? `<dl>${facts.map(([label, value]) => `<dt style="font-weight:700;margin-top:8px">${escapeHtml(label)}</dt><dd style="margin:2px 0 0">${escapeHtml(value)}</dd>`).join("")}</dl>` : "";
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#183c25;max-width:620px"><p>${escapeHtml(greeting)}</p>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${htmlFacts}<p><a href="${BARSHEET_URL}">Open DCC Bar Schedule</a></p><p style="color:#5f7966">DCC Bar Schedule</p></div>`;
  return { subject: title, text, html };
}
export function renderNotification(type: string, payload: Payload): RenderedEmail {
  const firstName = string(payload, "firstName", "there"); const event = string(payload, "eventName");
  const date = string(payload, "eventDate"); const shift = string(payload, "shiftTime"); const actor = string(payload, "actorName", "a DCC Bar Schedule administrator");
  const facts = [["Event", event], ["Date", date], ["Shift", shift]].filter(([, value]) => Boolean(value)) as Array<[string, string]>;
  switch (type) {
    case "INITIAL_AUTHORIZATION": return layout("You can now use the DCC Bar Schedule", `Hi ${firstName},`, ["You are now authorized to use the DCC Bar Schedule.", "Enter your approved email address and select Continue. Administrators must use the Google or Yahoo sign-in button. The schedule is now tracked by your user identity."]);
    case "ACCESS_APPROVED": return layout("Your DCC Bar Schedule access was approved", `Hi ${firstName},`, ["Your access request has been approved.", "Enter your approved email address and select Continue. Administrators must use the Google or Yahoo sign-in button."]);
    case "ASSIGNMENT_REMOVED":
      if (payload.shiftCancelled === true) return layout("Your DCC Bar Schedule shift has been cancelled", `Hi ${firstName},`, ["An administrator has cancelled the shift listed below. You are no longer scheduled to work this shift.", "Thank you for volunteering!"], facts);
      return layout("A DCC Bar Schedule assignment was removed", `Hi ${firstName},`, [`${string(payload, "volunteerName", "A volunteer")} has been removed from this shift by ${actor}. If this looks incorrect, please contact a club administrator.`], facts);
    case "ASSIGNMENT_REPLACED": return layout("A DCC Bar Schedule assignment was replaced", `Hi ${firstName},`, [`${string(payload, "oldVolunteer", "A volunteer")} was replaced by ${string(payload, "newVolunteer", "another volunteer")}. The change was made by ${actor}.`], facts);
    case "EVENT_CHANGED": return layout("A DCC Bar Schedule event or shift changed", `Hi ${firstName},`, ["An event or shift you are assigned to has changed. Please review the updated schedule."], facts);
    case "EVENT_CANCELLED": return layout("A DCC Bar Schedule event was cancelled", `Hi ${firstName},`, ["An event you were assigned to has been cancelled."], facts);
    case "TEST_EMAIL": return layout("DCC Bar Schedule test email", `Hi ${firstName},`, ["This is a controlled staging test of DCC Bar Schedule email delivery. No action is required."]);
    default: return layout(string(payload, "subject", "DCC Bar Schedule notification"), `Hi ${firstName},`, [string(payload, "message", "There is an update in the DCC Bar Schedule.")], facts);
  }
}
