import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";
import { displayName } from "../../../../lib/auth-policy";
import { canManageNotificationSettings, normalizeOptionalNotificationEmail } from "../../../../lib/notification-settings-policy";

function activeAdminResponse(user: Parameters<typeof canManageNotificationSettings>[0]) {
  return canManageNotificationSettings(user) ? null : NextResponse.json({ error: "An active administrator account is required." }, { status: 403 });
}

async function getOrCreateSettings() {
  return prisma.notificationSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function GET() {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const denied = activeAdminResponse(access.user); if (denied) return denied;
  try {
    const settings = await getOrCreateSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const denied = activeAdminResponse(access.user); if (denied) return denied;
  const body = (await request.json().catch(() => null)) as {
    notifEnabled?: unknown;
    notifShiftFilled?: unknown;
    notifShiftRemoved?: unknown;
    notifEventFilled?: unknown;
    secondaryShiftFilled?: unknown;
    secondaryShiftRemoved?: unknown;
    secondaryEventFilled?: unknown;
    toEmail?: unknown;
    ccEmail?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  let administratorEmail: string | null;
  let secondaryEmail: string | null;
  try { administratorEmail = normalizeOptionalNotificationEmail(body.toEmail); }
  catch { return NextResponse.json({ error: "Enter a valid administrator notification email or leave it blank." }, { status: 400 }); }
  try { secondaryEmail = normalizeOptionalNotificationEmail(body.ccEmail); }
  catch { return NextResponse.json({ error: "Enter a valid secondary notification email or leave it blank." }, { status: 400 }); }

  try {
    await getOrCreateSettings();
    const settings = await prisma.$transaction(async (tx) => {
      const previous = await tx.notificationSettings.findUniqueOrThrow({ where: { id: "singleton" } });
      const updated = await tx.notificationSettings.update({ where: { id: "singleton" }, data: {
        notifEnabled: Boolean(body.secondaryShiftFilled || body.secondaryShiftRemoved || body.secondaryEventFilled),
        notifShiftFilled: Boolean(body.notifShiftFilled),
        notifShiftRemoved: Boolean(body.notifShiftRemoved),
        notifEventFilled: Boolean(body.notifEventFilled),
        secondaryShiftFilled: Boolean(body.secondaryShiftFilled),
        secondaryShiftRemoved: Boolean(body.secondaryShiftRemoved),
        secondaryEventFilled: Boolean(body.secondaryEventFilled),
        toEmail: administratorEmail,
        ccEmail: secondaryEmail,
      } });
      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: previous.toEmail !== updated.toEmail ? "ADMIN_NOTIFICATION_EMAIL_CHANGED" : "SETTINGS_UPDATE", entityType: "NotificationSettings", entityId: "singleton",
        previousData: { notifEnabled: previous.notifEnabled, notifShiftFilled: previous.notifShiftFilled, notifShiftRemoved: previous.notifShiftRemoved, notifEventFilled: previous.notifEventFilled, secondaryShiftFilled: previous.secondaryShiftFilled, secondaryShiftRemoved: previous.secondaryShiftRemoved, secondaryEventFilled: previous.secondaryEventFilled, toEmail: previous.toEmail, ccEmail: previous.ccEmail },
        newData: { notifEnabled: updated.notifEnabled, notifShiftFilled: updated.notifShiftFilled, notifShiftRemoved: updated.notifShiftRemoved, notifEventFilled: updated.notifEventFilled, secondaryShiftFilled: updated.secondaryShiftFilled, secondaryShiftRemoved: updated.secondaryShiftRemoved, secondaryEventFilled: updated.secondaryEventFilled, toEmail: updated.toEmail, ccEmail: updated.ccEmail },
      }});
      return updated;
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }
}
