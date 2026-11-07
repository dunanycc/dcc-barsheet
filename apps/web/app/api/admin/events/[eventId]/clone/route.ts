import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../../lib/authorization";
import prisma from "../../../../../../lib/prisma";
import { displayName } from "../../../../../../lib/auth-policy";

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { eventId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    name?: unknown;
    notes?: unknown;
  } | null;

  const date = parseDate(body?.date);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!date) return NextResponse.json({ error: "A valid new date is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "New event name is required." }, { status: 400 });

  try {
    const source = await prisma.event.findUnique({
      where: { id: eventId },
      include: { shifts: true },
    });
    if (!source) return NextResponse.json({ error: "Source event not found." }, { status: 404 });

    const clone = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({ data: {
        sourceKey: `admin:${randomUUID()}`,
        date,
        name,
        notes: notes || null,
        shifts: {
          create: source.shifts.map((shift) => ({
            sourceKey: `admin:${randomUUID()}`,
            displayTime: shift.displayTime,
            sortMinutes: shift.sortMinutes,
            capacity: shift.capacity,
            isOpen: shift.isOpen,
          })),
        },
      }, select: { id: true } });
      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "EVENT_CLONE", entityType: "Event", entityId: created.id, eventId: created.id,
        previousData: { sourceEventId: source.id, name: source.name, date: source.date },
        newData: { name, date: date.toISOString().slice(0, 10), notes: notes || null, shiftCount: source.shifts.length },
      }});
      return created;
    });

    return NextResponse.json({ ok: true, eventId: clone.id, count: source.shifts.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not clone the event." }, { status: 500 });
  }
}
