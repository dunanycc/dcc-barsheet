import { NextRequest, NextResponse } from "next/server";
import { displayName } from "../../../../lib/auth-policy";
import { authorizeMemberRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";
import { queueAdministratorNotification } from "../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../lib/notification-processor";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const access = await authorizeMemberRequest();
  if (!access.ok) return access.response;
  const { assignmentId } = await context.params;
  try {
    const notificationIds = await prisma.$transaction(async (tx) => {
      const assignment = await tx.shiftAssignment.findUnique({ where: { id: assignmentId }, include: {
        volunteerProfile: { select: { userId: true, firstName: true } },
        shift: { include: { event: { select: { id: true, name: true, date: true, isLocked: true } } } },
      }});
      if (!assignment || assignment.status !== "ACTIVE") throw new Error("NOT_FOUND");
      if (assignment.volunteerProfile?.userId !== access.user.id) throw new Error("NOT_OWNER");
      if (assignment.shift.event.isLocked) throw new Error("SHIFT_LOCKED");
      await tx.shiftAssignment.update({ where: { id: assignmentId }, data: { status: "REMOVED", removedAt: new Date() } });
      await tx.auditEvent.create({ data: {
        operationId: assignment.operationId, actorUserId: access.user.id,
        actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "SIGNUP_REMOVE", entityType: "ShiftAssignment", entityId: assignmentId,
        eventId: assignment.shift.event.id,
        previousData: { shiftId: assignment.shiftId, enteredName: assignment.enteredName, volunteerProfileId: assignment.volunteerProfileId, status: "ACTIVE" },
        newData: { status: "REMOVED" },
      }});
      const volunteerNotification = await tx.notification.create({ data: {
        operationId: assignment.operationId, type: "ASSIGNMENT_REMOVED", recipientEmail: access.user.normalizedEmail,
        payload: { firstName: assignment.volunteerProfile?.firstName || access.user.firstName, volunteerName: assignment.enteredName, eventName: assignment.shift.event.name, eventDate: assignment.shift.event.date.toISOString().slice(0, 10), shiftTime: assignment.shift.displayTime, actorName: displayName(access.user) },
        relatedEntityType: "ShiftAssignment", relatedEntityId: assignmentId, eventId: assignment.shift.event.id,
      }});
      const administratorNotificationId = await queueAdministratorNotification(tx, { operationId: assignment.operationId, subject: "Volunteer removed from shift", message: `${assignment.enteredName} was removed from ${assignment.shift.event.name}.`, eventId: assignment.shift.event.id, relatedEntityType: "ShiftAssignment", relatedEntityId: assignmentId, details: { eventName: assignment.shift.event.name, eventDate: assignment.shift.event.date.toISOString().slice(0, 10), shiftTime: assignment.shift.displayTime, volunteerName: assignment.enteredName } });
      return [volunteerNotification.id, administratorNotificationId].filter((id): id is string => Boolean(id));
    });
    await deliverNewNotifications({ notificationIds });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "Signup was already removed." }, { status: 404 });
    if (code === "NOT_OWNER") return NextResponse.json({ error: "You can only remove your own signup." }, { status: 403 });
    if (code === "SHIFT_LOCKED") return NextResponse.json({ error: "This event is locked." }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Signup could not be removed. Please try again." }, { status: 500 });
  }
}
