import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../../../generated/prisma/client";
import { displayName } from "../../../../../../lib/auth-policy";
import { authorizeAdminRequest } from "../../../../../../lib/authorization";
import prisma from "../../../../../../lib/prisma";

function yearRange(value: string) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return { year, start: new Date(`${year}-01-01T00:00:00.000Z`), end: new Date(`${year}-12-31T23:59:59.999Z`) };
}

async function impact(year: { start: Date; end: Date }) {
  const events = await prisma.event.findMany({ where: { date: { gte: year.start, lte: year.end }, status: "ACTIVE" }, select: { id: true, shifts: { select: { id: true, _count: { select: { assignments: { where: { status: "ACTIVE" } } } } } } } });
  return { events: events.length, shifts: events.reduce((sum, event) => sum + event.shifts.length, 0), signups: events.reduce((sum, event) => sum + event.shifts.reduce((shiftSum, shift) => shiftSum + shift._count.assignments, 0), 0) };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ year: string }> }) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const range = yearRange((await context.params).year); if (!range) return NextResponse.json({ error: "Choose a valid year." }, { status: 400 });
  return NextResponse.json({ year: range.year, counts: await impact(range) });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ year: string }> }) {
  const access = await authorizeAdminRequest(); if (!access.ok) return access.response;
  const range = yearRange((await context.params).year); if (!range) return NextResponse.json({ error: "Choose a valid year." }, { status: 400 });
  const body = await request.json().catch(() => null) as { confirmation?: string } | null;
  if (body?.confirmation !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  try {
    const counts = await prisma.$transaction(async (tx) => {
      const events = await tx.event.findMany({ where: { date: { gte: range.start, lte: range.end }, status: "ACTIVE" }, select: { id: true, shifts: { select: { id: true } } } });
      const eventIds = events.map((event) => event.id); const shiftIds = events.flatMap((event) => event.shifts.map((shift) => shift.id));
      const signupCount = shiftIds.length ? await tx.shiftAssignment.count({ where: { shiftId: { in: shiftIds }, status: "ACTIVE" } }) : 0;
      if (shiftIds.length) { await tx.shiftAssignment.updateMany({ where: { shiftId: { in: shiftIds }, status: "ACTIVE" }, data: { status: "REMOVED", removedAt: new Date() } }); await tx.shift.updateMany({ where: { id: { in: shiftIds } }, data: { isOpen: false } }); }
      if (eventIds.length) await tx.event.updateMany({ where: { id: { in: eventIds } }, data: { status: "ARCHIVED", archivedAt: new Date(), isLocked: true } });
      const result = { events: eventIds.length, shifts: shiftIds.length, signups: signupCount };
      await tx.auditEvent.create({ data: { operationId: randomUUID(), actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail, action: "SCHEDULE_YEAR_REMOVED", entityType: "ScheduleYear", entityId: String(range.year), previousData: { year: range.year, ...result }, newData: { status: "ARCHIVED" } } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, year: range.year, counts });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Could not remove the schedule year." }, { status: 500 }); }
}
