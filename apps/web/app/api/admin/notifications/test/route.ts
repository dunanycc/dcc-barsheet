import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { displayName, normalizeEmail } from "../../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import { processOutbox } from "../../../../../lib/notification-processor";
import prisma from "../../../../../lib/prisma";

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const recipientEmail = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  if (!/^\S+@\S+\.\S+$/.test(recipientEmail)) return NextResponse.json({ error: "Enter a valid test recipient email." }, { status: 400 });
  const operationId = randomUUID();
  const notification = await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({ data: { operationId, type: "TEST_EMAIL", recipientEmail, payload: { firstName: access.user.firstName }, relatedEntityType: "User", relatedEntityId: access.user.id } });
    return created;
  });
  const result = await processOutbox({ onlyId: notification.id, limit: 1 });
  await prisma.auditEvent.create({ data: { operationId, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
    action: result.sent === 1 ? "TEST_EMAIL_SENT" : "TEST_EMAIL_FAILED", entityType: "Notification", entityId: notification.id, newData: { recipientEmail, sent: result.sent === 1 } } });
  if (result.sent === 1) return NextResponse.json({ sent: true });
  return NextResponse.json({ sent: false, error: "Email could not be sent. The notification remains available for retry." }, { status: 502 });
}
