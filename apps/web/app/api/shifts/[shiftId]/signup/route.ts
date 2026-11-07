import { Prisma } from "../../../../generated/prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { authorizeMemberRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";

export async function POST(request: NextRequest, context: { params: Promise<{ shiftId: string }> }) {
  const access = await authorizeMemberRequest();
  if (!access.ok) return access.response;
  const { shiftId } = await context.params;
  const body = await request.json().catch(() => ({})) as { volunteerProfileId?: string };
  try {
    const assignment = await prisma.$transaction(async (tx) => {
      const profiles = await tx.volunteerProfile.findMany({ where: { userId: access.user.id, active: true } });
      const profile = body.volunteerProfileId ? profiles.find((item) => item.id === body.volunteerProfileId) : profiles.length === 1 ? profiles[0] : null;
      if (!profile) throw new Error(profiles.length > 1 ? "PROFILE_REQUIRED" : "PROFILE_UNAVAILABLE");
      const name = `${profile.firstName} ${profile.lastName}`.trim();
      const shift = await tx.shift.findUnique({ where: { id: shiftId }, include: {
        event: { select: { id: true, isLocked: true, status: true } },
        assignments: { where: { status: "ACTIVE" }, select: { id: true, volunteerProfileId: true } },
      }});
      if (!shift || !shift.isOpen || shift.event.status !== "ACTIVE") throw new Error("SHIFT_UNAVAILABLE");
      if (shift.event.isLocked) throw new Error("SHIFT_LOCKED");
      if (shift.assignments.length >= shift.capacity) throw new Error("SHIFT_FULL");
      if (shift.assignments.some((item) => item.volunteerProfileId === profile.id)) throw new Error("ALREADY_SIGNED_UP");
      const created = await tx.shiftAssignment.create({ data: {
        shiftId, enteredName: name, volunteerProfileId: profile.id, createdByUserId: access.user.id,
      }, select: { id: true, enteredName: true, operationId: true }});
      await tx.auditEvent.create({ data: {
        operationId: created.operationId, actorUserId: access.user.id, actorNameSnapshot: name,
        actorEmailSnapshot: access.user.normalizedEmail, action: "SIGNUP_ADD",
        entityType: "ShiftAssignment", entityId: created.id, eventId: shift.event.id,
        newData: { shiftId, enteredName: name, volunteerProfileId: profile.id, profileOwnerUserId: access.user.id },
      }});
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      SHIFT_UNAVAILABLE: "This shift is no longer available.", SHIFT_LOCKED: "This event is locked.",
      SHIFT_FULL: "That shift was just filled. Please choose another.",
      ALREADY_SIGNED_UP: "You are already signed up for this shift.",
      PROFILE_REQUIRED: "Choose who is taking this shift.", PROFILE_UNAVAILABLE: "No active volunteer profile is available.",
    };
    if (messages[code]) return NextResponse.json({ error: messages[code] }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Signup could not be saved. Please try again." }, { status: 500 });
  }
}
