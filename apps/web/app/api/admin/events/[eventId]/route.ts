import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { displayName } from "../../../../../lib/auth-policy";
import { queueAdministratorNotification } from "../../../../../lib/administrator-notifications";
import { deliverNewNotifications } from "../../../../../lib/notification-processor";

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return undefined;
  return date;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { eventId } = await context.params;
  const operationId = randomUUID();
  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    name?: unknown;
    notes?: unknown;
    adminNotes?: unknown;
    isPrivate?: unknown;
    isLocked?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const data: {
    date?: Date;
    name?: string;
    notes?: string | null;
    adminNotes?: string | null;
    isPrivate?: boolean;
    isLocked?: boolean;
  } = {};

  if (body.date !== undefined) {
    const date = parseDate(body.date);
    if (!date) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
    data.date = date;
  }
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    data.name = name;
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (body.adminNotes !== undefined) {
    data.adminNotes = typeof body.adminNotes === "string" ? body.adminNotes.trim() || null : null;
  }
  if (body.isPrivate !== undefined) data.isPrivate = Boolean(body.isPrivate);
  if (body.isLocked !== undefined) data.isLocked = Boolean(body.isLocked);

  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.event.findUnique({ where: { id: eventId }, include: { shifts: { include: { assignments: { where: { status: "ACTIVE", userId: { not: null } }, include: { user: { select: { firstName: true, normalizedEmail: true } } } } } } } });
      if (!previous) throw new Error("NOT_FOUND");
      const updated = await tx.event.update({ where: { id: eventId }, data });
      await tx.auditEvent.create({ data: {
        operationId,
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "EVENT_UPDATE", entityType: "Event", entityId: eventId, eventId,
        previousData: { date: previous.date, name: previous.name, notes: previous.notes, adminNotes: previous.adminNotes, isPrivate: previous.isPrivate, isLocked: previous.isLocked },
        newData: { date: updated.date, name: updated.name, notes: updated.notes, adminNotes: updated.adminNotes, isPrivate: updated.isPrivate, isLocked: updated.isLocked },
      }});
      const materiallyChanged = previous.name !== updated.name || previous.date.valueOf() !== updated.date.valueOf();
      if (materiallyChanged) {
        const recipients = new Map(previous.shifts.flatMap((shift) => shift.assignments).filter((assignment) => assignment.user).map((assignment) => [assignment.user!.normalizedEmail, assignment.user!]));
        if (recipients.size) await tx.notification.createMany({ data: [...recipients.values()].map((user) => ({
          operationId, type: "EVENT_CHANGED" as const, recipientEmail: user.normalizedEmail,
          payload: { firstName: user.firstName, eventName: updated.name, eventDate: updated.date.toISOString().slice(0, 10), actorName: displayName(access.user) }, relatedEntityType: "Event", relatedEntityId: eventId, eventId,
        })) });
        await queueAdministratorNotification(tx, { operationId, subject: "Event changed", message: `${updated.name} was changed by ${displayName(access.user)}.`, eventId, relatedEntityType: "Event", relatedEntityId: eventId, details: { eventName: updated.name, eventDate: updated.date.toISOString().slice(0, 10) } });
      }
    });
    await deliverNewNotifications({ operationId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ error: "Event not found." }, { status: 404 });
    console.error(error);
    return NextResponse.json({ error: "Could not update the event." }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { eventId } = await context.params;
  const operationId = randomUUID();

  try {
    const previous = await prisma.event.findUnique({ where: { id: eventId }, include: { shifts: { include: { assignments: { where: { status: "ACTIVE", userId: { not: null } }, include: { user: { select: { firstName: true, normalizedEmail: true } } } } } } } });
    if (!previous) return NextResponse.json({ error: "Event not found." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id: eventId }, data: {
        status: "CANCELLED", cancelledAt: new Date(), isLocked: true,
      }});
      await tx.auditEvent.create({ data: {
        operationId,
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user),
        actorEmailSnapshot: access.user.normalizedEmail, action: "EVENT_CANCEL",
        entityType: "Event", entityId: eventId, eventId,
        previousData: { status: previous.status, isLocked: previous.isLocked },
        newData: { status: "CANCELLED", isLocked: true },
      }});
      const recipients = new Map(previous.shifts.flatMap((shift) => shift.assignments).filter((assignment) => assignment.user).map((assignment) => [assignment.user!.normalizedEmail, assignment.user!]));
      if (recipients.size) await tx.notification.createMany({ data: [...recipients.values()].map((user) => ({
        operationId, type: "EVENT_CANCELLED" as const, recipientEmail: user.normalizedEmail,
        payload: { firstName: user.firstName, eventName: previous.name, eventDate: previous.date.toISOString().slice(0, 10), actorName: displayName(access.user) }, relatedEntityType: "Event", relatedEntityId: eventId, eventId,
      })) });
      await queueAdministratorNotification(tx, { operationId, subject: "Event cancelled", message: `${previous.name} was cancelled by ${displayName(access.user)}.`, eventId, relatedEntityType: "Event", relatedEntityId: eventId, details: { eventName: previous.name, eventDate: previous.date.toISOString().slice(0, 10) } });
    });
    await deliverNewNotifications({ operationId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not cancel the event." }, { status: 500 });
  }
}
