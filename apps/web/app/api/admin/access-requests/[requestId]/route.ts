import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../../generated/prisma/client";
import { displayName } from "../../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { queueAdministratorNotification } from "../../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../../lib/notification-processor";

export async function PATCH(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { requestId } = await context.params;
  const body = (await request.json().catch(() => null)) as { decision?: "approve" | "reject"; reason?: string } | null;
  if (!body?.decision || !["approve", "reject"].includes(body.decision)) {
    return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  }
  const operationId = randomUUID();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pending = await tx.accessRequest.findUnique({ where: { id: requestId } });
      if (!pending || pending.status !== "PENDING") throw new Error("NOT_PENDING");
      if (body.decision === "reject") {
        await tx.accessRequest.update({ where: { id: requestId }, data: {
          status: "REJECTED", pendingKey: null, decidedAt: new Date(),
          decidedByUserId: access.user.id, decisionReason: body.reason?.trim() || null,
        }});
        await tx.auditEvent.create({ data: {
          operationId, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
          actorEmailSnapshot: access.user.normalizedEmail, action: "ACCESS_REJECTED",
          entityType: "AccessRequest", entityId: requestId,
          previousData: { status: "PENDING" }, newData: { status: "REJECTED", firstName: pending.firstName, lastName: pending.lastName, normalizedEmail: pending.normalizedEmail },
          reason: body.reason?.trim() || null,
        }});
        return { decision: "rejected" };
      }
      const existing = await tx.user.findUnique({ where: { normalizedEmail: pending.normalizedEmail } });
      if (existing?.status === "DISABLED") throw new Error("USER_DISABLED");
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: {
            firstName: pending.firstName, lastName: pending.lastName, status: "APPROVED",
            approvedAt: new Date(), approvedByUserId: access.user.id,
          }})
        : await tx.user.create({ data: {
            email: pending.email, normalizedEmail: pending.normalizedEmail,
            firstName: pending.firstName, lastName: pending.lastName, status: "APPROVED",
            approvedAt: new Date(), approvedByUserId: access.user.id,
            volunteerProfiles: { create: { firstName: pending.firstName, lastName: pending.lastName, relationship: "PRIMARY" } },
          }});
      if (existing) await tx.volunteerProfile.updateMany({ where: { userId: user.id, relationship: "PRIMARY" }, data: { firstName: pending.firstName, lastName: pending.lastName } });
      await tx.accessRequest.update({ where: { id: requestId }, data: {
        status: "APPROVED", pendingKey: null, decidedAt: new Date(),
        decidedByUserId: access.user.id, approvedUserId: user.id,
      }});
      await tx.auditEvent.create({ data: {
        operationId, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
        actorEmailSnapshot: access.user.normalizedEmail, action: "ACCESS_APPROVED",
        entityType: "AccessRequest", entityId: requestId,
        previousData: { status: "PENDING" },
        newData: { status: "APPROVED", userId: user.id, firstName: user.firstName, lastName: user.lastName, normalizedEmail: user.normalizedEmail },
      }});
      await tx.notification.create({ data: {
        operationId, type: "ACCESS_APPROVED", recipientEmail: user.normalizedEmail,
        payload: { firstName: user.firstName }, relatedEntityType: "AccessRequest",
        relatedEntityId: requestId,
      }});
      await queueAdministratorNotification(tx, { operationId, subject: "Access request approved", message: `${user.firstName} ${user.lastName}'s DCC Bar Schedule access request was approved.`, relatedEntityType: "AccessRequest", relatedEntityId: requestId, details: { firstName: user.firstName, lastName: user.lastName, email: user.normalizedEmail } });
      return { decision: "approved", userId: user.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.decision === "approved") await deliverNewNotifications({ operationId });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_PENDING") return NextResponse.json({ error: "This request was already decided." }, { status: 409 });
    if (code === "USER_DISABLED") return NextResponse.json({ error: "This user is disabled and must be re-enabled separately." }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Could not decide the request." }, { status: 500 });
  }
}
