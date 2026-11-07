import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { displayName, normalizeEmail } from "../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";
import { queueAdministratorNotification } from "../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../lib/notification-processor";

export async function GET() {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const users = await prisma.user.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { identities: { select: { provider: true, lastUsedAt: true } }, volunteerProfiles: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json({ users: users.filter((user) => !user.hiddenAt), hiddenUsers: users.filter((user) => Boolean(user.hiddenAt)) });
}

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a name and valid email." }, { status: 400 });
  }
  const operationId = randomUUID();
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        email, normalizedEmail: email, firstName, lastName, status: "APPROVED",
        approvedAt: new Date(), approvedByUserId: access.user.id,
        volunteerProfiles: { create: { firstName, lastName, relationship: "PRIMARY" } },
      }});
      await tx.auditEvent.create({ data: {
        operationId, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
        actorEmailSnapshot: access.user.normalizedEmail, action: "ACCESS_APPROVED",
        entityType: "User", entityId: created.id,
        newData: { normalizedEmail: email, firstName, lastName, status: "APPROVED", role: "MEMBER" },
        reason: "Volunteer added by administrator",
      }});
      await tx.notification.create({ data: {
        operationId, type: "INITIAL_AUTHORIZATION", recipientEmail: email,
        payload: { firstName }, relatedEntityType: "User", relatedEntityId: created.id,
      }});
      await queueAdministratorNotification(tx, { operationId, subject: "Volunteer authorized", message: `${firstName} ${lastName} was authorized for the DCC Bar Schedule.`, relatedEntityType: "User", relatedEntityId: created.id, details: { firstName, lastName, email } });
      return created;
    });
    await deliverNewNotifications({ operationId });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  }
}
