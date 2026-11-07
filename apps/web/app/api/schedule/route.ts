import { NextResponse } from "next/server";
import { canAdminister } from "../../../lib/auth-policy";
import { authorizeMemberRequest } from "../../../lib/authorization";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await authorizeMemberRequest();
  if (!access.ok) return access.response;
  try {
    const isAdmin = canAdminister(access.user);
    const profiles = await prisma.volunteerProfile.findMany({ where: { userId: access.user.id, active: true }, orderBy: { relationship: "asc" }, select: { id: true, firstName: true, lastName: true, relationship: true } });
    const events = await prisma.event.findMany({
      where: { isPrivate: false, status: "ACTIVE" },
      orderBy: [{ date: "asc" }, { name: "asc" }],
      include: {
        shifts: {
          orderBy: { sortMinutes: "asc" },
          include: {
            assignments: {
              where: { status: "ACTIVE", AND: [{ OR: [{ userId: null }, { user: { hiddenAt: null } }] }, { OR: [{ volunteerProfileId: null }, { volunteerProfile: { user: { hiddenAt: null } } }] }] },
              orderBy: { createdAt: "asc" },
              select: { id: true, enteredName: true, volunteerProfile: { select: { userId: true, relationship: true } } },
            },
          },
        },
      },
    });

    return NextResponse.json({
      profiles,
      events: events.map((event) => ({
        id: event.id,
        date: event.date.toISOString().slice(0, 10),
        name: event.name,
        notes: event.notes,
        isLocked: event.isLocked,
        shifts: event.shifts.map((shift) => ({
          id: shift.id,
          displayTime: shift.displayTime,
          capacity: shift.capacity,
          isOpen: shift.isOpen,
          assignments: shift.assignments.map(({ volunteerProfile, ...assignment }) => ({
            ...assignment,
            profileLabel: volunteerProfile?.userId === access.user.id ? volunteerProfile.relationship : null,
            canRemove: isAdmin || volunteerProfile?.userId === access.user.id,
          })),
        })),
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "The schedule is temporarily unavailable." },
      { status: 503 },
    );
  }
}
