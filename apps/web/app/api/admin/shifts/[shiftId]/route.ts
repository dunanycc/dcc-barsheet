import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { slotStartMinutes } from "../../../../../lib/slot-time";
import { displayName } from "../../../../../lib/auth-policy";
import { queueAdministratorNotification } from "../../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../../lib/notification-processor";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ shiftId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { shiftId } = await context.params;
  const operationId = randomUUID();
  const body = (await request.json().catch(() => null)) as {
    displayTime?: unknown;
    capacity?: unknown;
    isOpen?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const data: { displayTime?: string; sortMinutes?: number; capacity?: number; isOpen?: boolean } = {};

  if (body.displayTime !== undefined) {
    const displayTime = typeof body.displayTime === "string" ? body.displayTime.trim() : "";
    if (!displayTime) return NextResponse.json({ error: "A time slot is required." }, { status: 400 });
    data.displayTime = displayTime;
    data.sortMinutes = slotStartMinutes(displayTime);
  }
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) {
      return NextResponse.json({ error: "Volunteers per slot must be 1–4." }, { status: 400 });
    }
    data.capacity = capacity;
  }
  if (body.isOpen !== undefined) data.isOpen = Boolean(body.isOpen);

  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.shift.findUnique({ where: { id: shiftId }, include: {
        event: { select: { id: true, name: true, date: true } },
        assignments: { where: { status: "ACTIVE", userId: { not: null } }, include: { user: { select: { firstName: true, normalizedEmail: true } } } },
      } });
      if (!previous) throw new Error("NOT_FOUND");
      const updated = await tx.shift.update({ where: { id: shiftId }, data });
      await tx.auditEvent.create({ data: {
        operationId,
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "SHIFT_UPDATE", entityType: "Shift", entityId: shiftId, eventId: previous.eventId,
        previousData: { displayTime: previous.displayTime, capacity: previous.capacity, isOpen: previous.isOpen },
        newData: { displayTime: updated.displayTime, capacity: updated.capacity, isOpen: updated.isOpen },
      }});
      if (previous.displayTime !== updated.displayTime) {
        const recipients = previous.assignments.filter((assignment) => assignment.user).map((assignment) => assignment.user!);
        if (recipients.length) await tx.notification.createMany({ data: recipients.map((user) => ({ operationId, type: "EVENT_CHANGED" as const,
          recipientEmail: user.normalizedEmail, payload: { firstName: user.firstName, eventName: previous.event.name, eventDate: previous.event.date.toISOString().slice(0, 10), shiftTime: updated.displayTime, actorName: displayName(access.user) },
          relatedEntityType: "Shift", relatedEntityId: shiftId, eventId: previous.event.id })) });
        await queueAdministratorNotification(tx, { operationId, subject: "Shift time changed", message: `A shift for ${previous.event.name} changed from ${previous.displayTime} to ${updated.displayTime}.`, eventId: previous.event.id, relatedEntityType: "Shift", relatedEntityId: shiftId, details: { eventName: previous.event.name, eventDate: previous.event.date.toISOString().slice(0, 10), shiftTime: updated.displayTime } });
      }
    });
    await deliverNewNotifications({ operationId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Time slot not found." }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "Could not update the time slot." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ shiftId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { shiftId } = await context.params;

  try {
    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { eventId: true, isOpen: true } });
    if (!shift) return NextResponse.json({ error: "Time slot not found." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.shift.update({ where: { id: shiftId }, data: { isOpen: false } });
      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
        actorEmailSnapshot: access.user.normalizedEmail, action: "SHIFT_CLOSE",
        entityType: "Shift", entityId: shiftId, eventId: shift.eventId,
        previousData: { isOpen: shift.isOpen }, newData: { isOpen: false },
        reason: "Time slot closed",
      }});
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not close the time slot." }, { status: 500 });
  }
}
