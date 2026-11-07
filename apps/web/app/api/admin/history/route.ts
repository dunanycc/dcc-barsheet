import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "../../../generated/prisma/client";
import { actionsForCategory, buildHistoryFilter, compactAuditSummary, describeAuditEvent } from "../../../../lib/audit-history";
import { authorizeAdminRequest } from "../../../../lib/authorization";
import prisma from "../../../../lib/prisma";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(...values: unknown[]) { return values.find((value) => typeof value === "string" && value.trim()) as string | undefined; }

export async function GET(request: NextRequest) {
  const access = await authorizeAdminRequest();
  if (!access.ok) return access.response;
  const params = request.nextUrl.searchParams;
  const category = params.get("category") || "all";
  const search = (params.get("search") || "").trim().slice(0, 100);
  const userId = (params.get("userId") || "").trim();
  const page = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(params.get("pageSize") || "25", 10) || 25));
  const action = actionsForCategory(category);
  if (category !== "all" && !action) return NextResponse.json({ error: "Invalid history category." }, { status: 400 });

  let matchingUserIds: string[] = [];
  let matchingEventIds: string[] = [];
  if (search) {
    const [users, events] = await Promise.all([prisma.user.findMany({ where: { OR: [
      { email: { contains: search, mode: "insensitive" } }, { normalizedEmail: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } },
    ] }, select: { id: true }, take: 100 }), prisma.event.findMany({ where: { name: { contains: search, mode: "insensitive" } }, select: { id: true }, take: 100 })]);
    matchingUserIds = users.map((user) => user.id);
    matchingEventIds = events.map((event) => event.id);
  }
  const where = buildHistoryFilter(category, userId, search, matchingUserIds, matchingEventIds) as Prisma.AuditEventWhereInput;
  const [total, rows] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);

  const eventIds = [...new Set(rows.map((row) => row.eventId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(rows.filter((row) => row.entityType === "User").map((row) => row.entityId).filter((id): id is string => Boolean(id)))];
  const shiftIds = rows.filter((row) => row.entityType === "Shift").map((row) => row.entityId).filter((id): id is string => Boolean(id));
  const assignmentIds = rows.filter((row) => row.entityType === "ShiftAssignment").map((row) => row.entityId).filter((id): id is string => Boolean(id));
  const [events, users, shifts, assignments] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true, date: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } }),
    prisma.shift.findMany({ where: { id: { in: shiftIds } }, include: { event: { select: { id: true, name: true, date: true } } } }),
    prisma.shiftAssignment.findMany({ where: { id: { in: assignmentIds } }, include: { user: { select: { firstName: true, lastName: true, email: true } }, shift: { include: { event: { select: { id: true, name: true, date: true } } } } } }),
  ]);
  const eventMap = new Map(events.map((item) => [item.id, item]));
  const userMap = new Map(users.map((item) => [item.id, item]));
  const shiftMap = new Map(shifts.map((item) => [item.id, item]));
  const assignmentMap = new Map(assignments.map((item) => [item.id, item]));

  const history = rows.map((row) => {
    const before = record(row.previousData); const after = record(row.newData); const details = record(row.details);
    const targetUser = row.entityType === "User" && row.entityId ? userMap.get(row.entityId) : undefined;
    const assignment = row.entityType === "ShiftAssignment" && row.entityId ? assignmentMap.get(row.entityId) : undefined;
    const directShift = row.entityType === "Shift" && row.entityId ? shiftMap.get(row.entityId) : undefined;
    const event = (row.eventId ? eventMap.get(row.eventId) : undefined) || directShift?.event || assignment?.shift.event;
    const targetName = targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : text(
      ...(row.action === "SIGNUP_REPLACE" ? [before.enteredName, after.enteredName] : [after.enteredName, before.enteredName]),
      after.firstName && after.lastName ? `${after.firstName} ${after.lastName}` : undefined,
      details.name, assignment?.enteredName,
    );
    const targetEmail = targetUser?.email || text(after.email, before.email, details.email, assignment?.user?.email);
    const shiftTime = directShift?.displayTime || assignment?.shift.displayTime || text(after.displayTime, before.displayTime, details.displayTime);
    const eventDate = event?.date.toISOString().slice(0, 10) || text(after.date, before.date, details.date);
    const description = describeAuditEvent({ action: row.action, actorName: row.actorNameSnapshot, targetName, eventName: event?.name || text(after.name, before.name), eventDate, shiftTime, reason: row.reason });
    return {
      id: row.id, operationId: row.operationId, createdAt: row.createdAt, action: row.action,
      actorName: row.actorNameSnapshot, actorEmail: row.actorEmailSnapshot,
      targetName, targetEmail, eventName: event?.name || text(after.name, before.name, details.eventName), eventDate, shiftTime,
      description, summary: compactAuditSummary(description, row.actorNameSnapshot),
      changes: { before: row.previousData, after: row.newData }, reason: row.reason,
    };
  });
  return NextResponse.json({ history, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
}
