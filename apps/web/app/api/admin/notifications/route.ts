import { NextRequest, NextResponse } from "next/server";
import { displayName } from "../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import { processOutbox } from "../../../../lib/notification-processor";
import prisma from "../../../../lib/prisma";

export async function GET() {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const notifications = await prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: {
    id: true, type: true, recipientEmail: true, status: true, attemptCount: true, createdAt: true, sentAt: true, lastAttemptAt: true, lastError: true,
  } });
  const settings = await prisma.notificationSettings.findUnique({ where: { id: "singleton" }, select: { toEmail: true } });
  return NextResponse.json({ notifications, adminRecipientConfigured: Boolean(settings?.toEmail) });
}

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as { limit?: unknown }; const limit = Number(body.limit) || 10;
  const result = await processOutbox({ limit });
  await prisma.auditEvent.create({ data: { actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
    action: "NOTIFICATION_PROCESS_RUN", entityType: "NotificationBatch", newData: result } });
  return NextResponse.json(result);
}
