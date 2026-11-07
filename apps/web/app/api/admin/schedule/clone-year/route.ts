import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminRequest } from "../../../../../lib/authorization";
import prisma from "../../../../../lib/prisma";
import { displayName } from "../../../../../lib/auth-policy";

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
    targetYear?: unknown;
    replaceExisting?: unknown;
    events?: unknown;
  } | null;

  const targetYear = Number(body?.targetYear);
  const replaceExisting = Boolean(body?.replaceExisting);
  const requestedEvents = Array.isArray(body?.events)
    ? body.events
        .map((entry) => {
          const record = entry as { sourceEventId?: unknown; date?: unknown };
          const date = parseDate(record.date);
          const sourceEventId = typeof record.sourceEventId === "string" ? record.sourceEventId : null;
          return date && sourceEventId ? { sourceEventId, date } : null;
        })
        .filter((entry): entry is { sourceEventId: string; date: Date } => entry !== null)
    : [];

  if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
    return NextResponse.json({ error: "A valid target year is required." }, { status: 400 });
  }
  if (!requestedEvents.length) {
    return NextResponse.json({ error: "Select at least one event to clone." }, { status: 400 });
  }

  const yearStart = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${targetYear}-12-31T23:59:59.999Z`);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.event.count({
        where: { date: { gte: yearStart, lte: yearEnd }, status: "ACTIVE" },
      });
      if (existingCount > 0 && !replaceExisting) {
        throw new Error("TARGET_YEAR_EXISTS");
      }

      let deleted = 0;
      if (existingCount > 0 && replaceExisting) {
        const outcome = await tx.event.updateMany({
          where: { date: { gte: yearStart, lte: yearEnd }, status: "ACTIVE" },
          data: { status: "ARCHIVED", archivedAt: new Date(), isLocked: true },
        });
        deleted = outcome.count;
      }

      const sourceEvents = await tx.event.findMany({
        where: { id: { in: requestedEvents.map((entry) => entry.sourceEventId) } },
        include: { shifts: true },
      });
      const sourceById = new Map(sourceEvents.map((event) => [event.id, event]));

      let created = 0;
      for (const entry of requestedEvents) {
        const source = sourceById.get(entry.sourceEventId);
        if (!source) continue;
        await tx.event.create({
          data: {
            sourceKey: `admin:${randomUUID()}`,
            date: entry.date,
            name: source.name,
            notes: source.notes,
            shifts: {
              create: source.shifts.map((shift) => ({
                sourceKey: `admin:${randomUUID()}`,
                displayTime: shift.displayTime,
                sortMinutes: shift.sortMinutes,
                capacity: shift.capacity,
                isOpen: shift.isOpen,
              })),
            },
          },
        });
        created += 1;
      }

      await tx.auditEvent.create({ data: {
        actorUserId: access.user.id, actorNameSnapshot: displayName(access.user), actorEmailSnapshot: access.user.normalizedEmail,
        action: "SCHEDULE_CLONED", entityType: "ScheduleYear", entityId: String(targetYear),
        previousData: { targetYear, archivedEvents: deleted }, newData: { targetYear, createdEvents: created, replaceExisting },
      }});

      return { created, deleted };
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "TARGET_YEAR_EXISTS") {
      return NextResponse.json(
        { error: "TARGET_YEAR_EXISTS", message: `${targetYear} already has events.` },
        { status: 409 },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Could not create the new year." }, { status: 500 });
  }
}
