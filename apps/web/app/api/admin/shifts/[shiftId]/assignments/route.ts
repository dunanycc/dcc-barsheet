import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../../lib/authorization";
import prisma from "../../../../../../lib/prisma";
import { displayName } from "../../../../../../lib/auth-policy";

const MAX_NAME_LENGTH = 80;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ shiftId: string }> },
) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const { shiftId } = await context.params;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const assignment = await prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({
        where: { id: shiftId },
        include: { event: { select: { id: true } }, assignments: { where: { status: "ACTIVE" }, select: { id: true } } },
      });
      if (!shift) throw new Error("SHIFT_NOT_FOUND");
      if (shift.assignments.length >= shift.capacity) throw new Error("SHIFT_FULL");

      const created = await tx.shiftAssignment.create({
        data: { shiftId, enteredName: name, createdByUserId: access.user.id },
        select: { id: true, enteredName: true },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: access.user.id,
          actorNameSnapshot: displayName(access.user),
          actorEmailSnapshot: access.user.normalizedEmail,
          action: "SIGNUP_ADD",
          entityType: "ShiftAssignment",
          entityId: created.id,
          eventId: shift.event.id,
          newData: { shiftId, enteredName: name, userId: null },
        },
      });
      return created;
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SHIFT_NOT_FOUND") {
      return NextResponse.json({ error: "That time slot no longer exists." }, { status: 404 });
    }
    if (code === "SHIFT_FULL") {
      return NextResponse.json({ error: "That slot is already full." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Could not add the volunteer." }, { status: 500 });
  }
}
