import { NextResponse } from "next/server";
import { displayName } from "../../../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../../../lib/authorization";
import prisma from "../../../../../../lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ notificationId: string }> }) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const { notificationId } = await context.params;
  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.notification.updateMany({ where: { id: notificationId, status: "FAILED", attemptCount: { lt: 5 } }, data: { status: "PENDING", nextAttemptAt: null, lastError: null, claimToken: null, claimedAt: null } });
      if (result.count !== 1) throw new Error("NOT_RETRYABLE");
      await tx.auditEvent.create({ data: { actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "NOTIFICATION_RETRY", entityType: "Notification", entityId: notificationId } });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_RETRYABLE") return NextResponse.json({ error: "This notification is not available for retry." }, { status: 409 });
    return NextResponse.json({ error: "The notification could not be queued for retry." }, { status: 500 });
  }
}
