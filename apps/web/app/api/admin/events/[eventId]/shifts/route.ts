import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../../lib/authorization";
import prisma from "../../../../../../lib/prisma";
import { slotStartMinutes } from "../../../../../../lib/slot-time";
import { displayName } from "../../../../../../lib/auth-policy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { eventId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    displayTime?: unknown;
    capacity?: unknown;
  } | null;

  const displayTime = typeof body?.displayTime === "string" ? body.displayTime.trim() : "";
  const capacity = Number(body?.capacity);

  if (!displayTime) return NextResponse.json({ error: "A time slot is required." }, { status: 400 });
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) {
    return NextResponse.json({ error: "Volunteers per slot must be 1–4." }, { status: 400 });
  }

  try {
    const shift = await prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({ data: {
        eventId,
        sourceKey: `admin:${randomUUID()}`,
        displayTime,
        sortMinutes: slotStartMinutes(displayTime),
        capacity,
      }, select: { id: true } });
      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "SHIFT_CREATE", entityType: "Shift", entityId: created.id, eventId,
        newData: { displayTime, capacity, isOpen: true },
      }});
      return created;
    });
    return NextResponse.json({ ok: true, shiftId: shift.id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not add the time slot." }, { status: 500 });
  }
}
