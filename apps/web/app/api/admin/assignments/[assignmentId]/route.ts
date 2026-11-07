import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { displayName } from "../../../../../lib/auth-policy";
import { queueAdministratorNotification } from "../../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../../lib/notification-processor";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ assignmentId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { assignmentId } = await context.params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.shiftAssignment.findUnique({ where: { id: assignmentId }, include: {
        user: { select: { firstName: true, normalizedEmail: true } },
        shift: { include: { event: { select: { id: true, name: true, date: true } } } },
      } });
      if (!assignment || assignment.status !== "ACTIVE") throw new Error("NOT_FOUND");

      await tx.shiftAssignment.update({
        where: { id: assignmentId },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: access.user.id,
          actorNameSnapshot: displayName(access.user),
          actorEmailSnapshot: access.user.normalizedEmail,
          action: "SIGNUP_REMOVE",
          entityType: "ShiftAssignment",
          entityId: assignmentId,
          eventId: assignment.shift.eventId,
          previousData: { shiftId: assignment.shiftId, enteredName: assignment.enteredName, status: "ACTIVE" },
          newData: { status: "REMOVED" },
        },
      });
      const volunteerNotification = assignment.user ? await tx.notification.create({ data: {
        operationId: assignment.operationId, type: "ASSIGNMENT_REMOVED", recipientEmail: assignment.user.normalizedEmail,
        payload: { firstName: assignment.user.firstName, eventName: assignment.shift.event.name, eventDate: assignment.shift.event.date.toISOString().slice(0, 10), shiftTime: assignment.shift.displayTime, actorName: displayName(access.user) },
        relatedEntityType: "ShiftAssignment", relatedEntityId: assignmentId, eventId: assignment.shift.event.id,
      }}) : null;
      const administratorNotificationId = await queueAdministratorNotification(tx, { operationId: assignment.operationId, subject: "Volunteer removed from shift", message: `${assignment.enteredName} was removed from ${assignment.shift.event.name}.`, eventId: assignment.shift.event.id, relatedEntityType: "ShiftAssignment", relatedEntityId: assignmentId, details: { eventName: assignment.shift.event.name, eventDate: assignment.shift.event.date.toISOString().slice(0, 10), shiftTime: assignment.shift.displayTime, volunteerName: assignment.enteredName } });
      return { ok: true, notificationIds: [volunteerNotification?.id, administratorNotificationId].filter((id): id is string => Boolean(id)) };
    });
    await deliverNewNotifications({ notificationIds: result.notificationIds });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: "Signup was already removed." }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Could not remove the volunteer." }, { status: 500 });
  }
}
