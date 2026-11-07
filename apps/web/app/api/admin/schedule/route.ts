import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;

  try {
    const events = await prisma.event.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ date: "asc" }, { name: "asc" }],
      include: {
        shifts: {
          orderBy: { sortMinutes: "asc" },
          include: {
            assignments: {
              where: { status: "ACTIVE", AND: [{ OR: [{ userId: null }, { user: { hiddenAt: null } }] }, { OR: [{ volunteerProfileId: null }, { volunteerProfile: { user: { hiddenAt: null } } }] }] },
              orderBy: { createdAt: "asc" },
              select: { id: true, enteredName: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        date: event.date.toISOString().slice(0, 10),
        name: event.name,
        notes: event.notes,
        adminNotes: event.adminNotes,
        isLocked: event.isLocked,
        isPrivate: event.isPrivate,
        shifts: event.shifts.map((shift) => ({
          id: shift.id,
          displayTime: shift.displayTime,
          capacity: shift.capacity,
          isOpen: shift.isOpen,
          assignments: shift.assignments,
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
