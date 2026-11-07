import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";
import { slotStartMinutes } from "../../../../lib/slot-time";
import { displayName } from "../../../../lib/auth-policy";

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

export async function POST(request: NextRequest) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as {
    date?: unknown;
    name?: unknown;
    notes?: unknown;
    adminNotes?: unknown;
    maxVols?: unknown;
    slotTimes?: unknown;
  } | null;

  const date = parseDate(body?.date);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes.trim() : "";
  const maxVols = Number(body?.maxVols);
  const slotTimes = Array.isArray(body?.slotTimes)
    ? body.slotTimes.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : [];

  if (!date) return NextResponse.json({ error: "A valid date is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Event name is required." }, { status: 400 });
  if (!Number.isInteger(maxVols) || maxVols < 1 || maxVols > 4) {
    return NextResponse.json({ error: "Volunteers per slot must be 1–4." }, { status: 400 });
  }
  if (!slotTimes.length) {
    return NextResponse.json({ error: "Select at least one time slot." }, { status: 400 });
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({ data: {
        sourceKey: `admin:${randomUUID()}`,
        date,
        name,
        notes: notes || null,
        adminNotes: adminNotes || null,
        shifts: {
          create: slotTimes.map((displayTime) => ({
            sourceKey: `admin:${randomUUID()}`,
            displayTime,
            sortMinutes: slotStartMinutes(displayTime),
            capacity: maxVols,
          })),
        },
      }, select: { id: true } });
      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "EVENT_CREATE", entityType: "Event", entityId: created.id, eventId: created.id,
        newData: { name, date: date.toISOString().slice(0, 10), notes: notes || null, adminNotes: adminNotes || null, maxVols, slotTimes },
      }});
      return created;
    });

    return NextResponse.json({ ok: true, eventId: event.id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not create the event." }, { status: 500 });
  }
}
