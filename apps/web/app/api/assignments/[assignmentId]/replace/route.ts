import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../../generated/prisma/client";
import { displayName } from "../../../../../lib/auth-policy";
import { authorizeMemberRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { queueAdministratorNotification } from "../../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../../lib/notification-processor";

export async function POST(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const access = await authorizeMemberRequest();
  if (!access.ok) return access.response;
  const { assignmentId } = await context.params;
  const operationId = randomUUID();
  const body=await request.json().catch(()=>({})) as {volunteerProfileId?:string};
  try {
    const replacement = await prisma.$transaction(async (tx) => {
      const current = await tx.shiftAssignment.findUnique({ where: { id: assignmentId }, include: {
        volunteerProfile: { include: { user: { select: { firstName: true, normalizedEmail: true } } } },
        shift: { include: { event: { select: { id: true, name: true, date: true, isLocked: true, status: true } } } },
      }});
      if (!current || current.status !== "ACTIVE") throw new Error("NOT_FOUND");
      const profiles=await tx.volunteerProfile.findMany({where:{userId:access.user.id,active:true}});const profile=body.volunteerProfileId?profiles.find(p=>p.id===body.volunteerProfileId):profiles.length===1?profiles[0]:null;if(!profile)throw new Error("PROFILE_REQUIRED");
      if (current.volunteerProfileId === profile.id) throw new Error("ALREADY_ASSIGNED");
      if (current.shift.event.isLocked || current.shift.event.status !== "ACTIVE") throw new Error("SHIFT_LOCKED");
      const existing = await tx.shiftAssignment.findFirst({ where: {
        shiftId: current.shiftId, volunteerProfileId: profile.id, status: "ACTIVE",
      }});
      if (existing) throw new Error("ALREADY_ASSIGNED");
      await tx.shiftAssignment.update({ where: { id: assignmentId }, data: {
        status: "REPLACED", removedAt: new Date(),
      }});
      const created = await tx.shiftAssignment.create({ data: {
        shiftId: current.shiftId, enteredName: `${profile.firstName} ${profile.lastName}`.trim(), volunteerProfileId: profile.id,
        createdByUserId: access.user.id, operationId, replacedAssignmentId: current.id,
      }});
      await tx.auditEvent.create({ data: {
        operationId, actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
        actorEmailSnapshot: access.user.normalizedEmail, action: "SIGNUP_REPLACE",
        entityType: "ShiftAssignment", entityId: created.id, eventId: current.shift.event.id,
        previousData: { assignmentId: current.id, enteredName: current.enteredName, volunteerProfileId: current.volunteerProfileId },
        newData: { assignmentId: created.id, enteredName: created.enteredName, volunteerProfileId: created.volunteerProfileId },
      }});
      const payload = { eventName: current.shift.event.name, eventDate: current.shift.event.date.toISOString().slice(0, 10), shiftTime: current.shift.displayTime,
        oldVolunteer: current.enteredName, newVolunteer: created.enteredName, actorName: displayName(access.user) };
      if (current.volunteerProfile?.user) await tx.notification.create({ data: { operationId, type: "ASSIGNMENT_REPLACED", recipientEmail: current.volunteerProfile.user.normalizedEmail,
        payload: { ...payload, firstName: current.volunteerProfile.firstName }, relatedEntityType: "ShiftAssignment", relatedEntityId: current.id, eventId: current.shift.event.id } });
      await tx.notification.create({ data: { operationId, type: "ASSIGNMENT_REPLACED", recipientEmail: access.user.normalizedEmail,
        payload: { ...payload, firstName: access.user.firstName }, relatedEntityType: "ShiftAssignment", relatedEntityId: created.id, eventId: current.shift.event.id } });
      await queueAdministratorNotification(tx, { operationId, subject: "Shift assignment replaced", message: `${current.enteredName} was replaced by ${created.enteredName} for ${current.shift.event.name}.`, eventId: current.shift.event.id, relatedEntityType: "ShiftAssignment", relatedEntityId: created.id, details: { eventName: current.shift.event.name, eventDate: current.shift.event.date.toISOString().slice(0, 10), shiftTime: current.shift.displayTime, oldVolunteer: current.enteredName, newVolunteer: created.enteredName } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await deliverNewNotifications({ operationId });
    return NextResponse.json({ replacement }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "That signup is no longer active." }, { status: 404 });
    if (code === "ALREADY_ASSIGNED") return NextResponse.json({ error: "You are already assigned to this shift." }, { status: 409 });
    if (code === "SHIFT_LOCKED") return NextResponse.json({ error: "This shift cannot be changed." }, { status: 409 });
    if (code === "PROFILE_REQUIRED") return NextResponse.json({ error: "Choose who is taking this shift." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "The replacement could not be saved." }, { status: 500 });
  }
}
