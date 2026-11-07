import { createHash } from "node:crypto";
import prisma from "./prisma";
import { slotStartMinutes } from "./slot-time";

const EXPECTED_HEADERS = [
  "Date",
  "EventName",
  "Notes",
  "SlotTime",
  "MaxVols",
  "IsOpen",
  "Vol1",
  "Vol2",
  "Vol3",
  "Vol4",
] as const;

type CsvRow = Record<string, string>;

export type ImportShift = {
  sourceKey: string;
  displayTime: string;
  sortMinutes: number;
  capacity: number;
  isOpen: boolean;
  volunteers: Array<{ name: string; sourceSlot: number; volunteerProfileId?: string }>;
};

export type ImportEvent = {
  sourceKey: string;
  legacyEventId: string | null;
  date: string;
  name: string;
  notes: string;
  adminNotes: string;
  isPrivate: boolean;
  isLocked: boolean;
  shifts: ImportShift[];
};

export type ImportPreview = {
  sourceHash: string;
  events: ImportEvent[];
  warnings: string[];
  counts: {
    events: number;
    shifts: number;
    signups: number;
    warnings: number;
  };
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((cell) => cell.trim()));
}

function parseBoolean(value: string, defaultValue = false) {
  if (!value.trim()) return defaultValue;
  return ["true", "yes", "1"].includes(value.trim().toLowerCase());
}

function parseDate(value: string, rowNumber: number) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Row ${rowNumber}: Date must use YYYY-MM-DD`);
  }
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== trimmed) {
    throw new Error(`Row ${rowNumber}: Date is invalid`);
  }
  return trimmed;
}

function stablePart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function previewScheduleImport(text: string): ImportPreview {
  const sourceHash = createHash("sha256").update(text).digest("hex");
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("CSV contains no schedule rows");

  const headers = parsed[0].map((header) => header.trim().replace(/^\uFEFF/, ""));
  for (const required of EXPECTED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`CSV is missing required column: ${required}`);
    }
  }

  const rows: CsvRow[] = parsed.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
  const warnings: string[] = [];
  const events = new Map<string, ImportEvent>();
  const seenShifts = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const date = parseDate(row.Date, rowNumber);
    const name = row.EventName.trim();
    const displayTime = row.SlotTime.trim();
    if (!name) throw new Error(`Row ${rowNumber}: EventName is required`);
    if (!displayTime) throw new Error(`Row ${rowNumber}: SlotTime is required`);

    const legacyEventId = (row.EventId ?? "").trim() || null;
    const eventKey =
      legacyEventId ? `event-id:${legacyEventId}` : `legacy:${date}|${stablePart(name)}`;
    const shiftKey = `${eventKey}|${stablePart(displayTime)}`;
    if (seenShifts.has(shiftKey)) {
      throw new Error(`Row ${rowNumber}: duplicate event and time slot`);
    }
    seenShifts.add(shiftKey);

    let capacity = Number(row.MaxVols);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4) {
      warnings.push(`Row ${rowNumber}: MaxVols was normalized to 2`);
      capacity = 2;
    }

    const volunteers = [row.Vol1, row.Vol2, row.Vol3, row.Vol4]
      .slice(0, capacity)
      .map((volunteer, volunteerIndex) => ({
        name: volunteer.trim(),
        sourceSlot: volunteerIndex + 1,
      }))
      .filter((volunteer) => volunteer.name);

    const existing = events.get(eventKey);
    const event =
      existing ??
      {
        sourceKey: eventKey,
        legacyEventId,
        date,
        name,
        notes: row.Notes.trim(),
        adminNotes: (row.AdminNotes ?? "").trim(),
        isPrivate: parseBoolean(row.IsPrivate ?? ""),
        isLocked: parseBoolean(row.Locked ?? ""),
        shifts: [],
      };

    if (existing && (existing.date !== date || existing.name !== name)) {
      throw new Error(`Row ${rowNumber}: EventId is reused for conflicting events`);
    }
    event.shifts.push({
      sourceKey: shiftKey,
      displayTime,
      sortMinutes: slotStartMinutes(displayTime),
      capacity,
      isOpen: parseBoolean(row.IsOpen, true),
      volunteers,
    });
    events.set(eventKey, event);
  });

  const normalizedEvents = [...events.values()]
    .map((event) => ({
      ...event,
      shifts: event.shifts.sort((a, b) => a.sortMinutes - b.sortMinutes),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const counts = {
    events: normalizedEvents.length,
    shifts: normalizedEvents.reduce((sum, event) => sum + event.shifts.length, 0),
    signups: normalizedEvents.reduce(
      (sum, event) =>
        sum + event.shifts.reduce((shiftSum, shift) => shiftSum + shift.volunteers.length, 0),
      0,
    ),
    warnings: warnings.length,
  };

  return { sourceHash, events: normalizedEvents, warnings, counts };
}

export async function analyzeScheduleIdentities(preview: ImportPreview): Promise<ImportPreview> {
  const users = await prisma.user.findMany({ where: { hiddenAt: null, status: { in: ["APPROVED", "ACTIVE"] } }, select: { normalizedEmail: true, volunteerProfiles: { where: { active: true }, select: { id: true, firstName: true, lastName: true, relationship: true } } } });
  const profiles = users.flatMap((user) => user.volunteerProfiles.map((profile) => ({ ...profile, normalizedEmail: profile.relationship === "PRIMARY" ? user.normalizedEmail : "" })));
  const byName = new Map<string, typeof profiles>(); const byEmail = new Map(profiles.filter((profile) => profile.normalizedEmail).map((profile) => [profile.normalizedEmail, profile]));
  profiles.forEach((profile) => { const key = stablePart(`${profile.firstName} ${profile.lastName}`); byName.set(key, [...(byName.get(key) || []), profile]); });
  const warnings = [...preview.warnings]; const reported = new Set<string>();
  const events = preview.events.map((event) => ({ ...event, shifts: event.shifts.map((shift) => ({ ...shift, volunteers: shift.volunteers.map((volunteer) => {
    const emailMatch = byEmail.get(normalizePotentialEmail(volunteer.name)); const nameMatches = byName.get(stablePart(volunteer.name)) || []; const match = emailMatch || (nameMatches.length === 1 ? nameMatches[0] : null);
    if (!match && !reported.has(volunteer.name)) { warnings.push(nameMatches.length > 1 ? `Ambiguous volunteer name: ${volunteer.name}. Original name will be preserved without a User link.` : `Unmatched volunteer: ${volunteer.name}. Original name will be preserved without a User link.`); reported.add(volunteer.name); }
    return match ? { ...volunteer, volunteerProfileId: match.id } : volunteer;
  }) })) }));
  return { ...preview, events, warnings, counts: { ...preview.counts, warnings: warnings.length } };
}

function normalizePotentialEmail(value: string) { return value.trim().toLowerCase(); }

export async function replaceSchedule(
  preview: ImportPreview,
  sourceFileName: string,
  actor: { id: string; firstName: string; lastName: string; normalizedEmail: string },
) {
  const previous = await prisma.importBatch.findFirst({ where: { sourceHash: preview.sourceHash, status: "APPLIED" }, orderBy: { createdAt: "desc" } });
  if (previous) return { ...previous, repeated: true as const };
  return prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        sourceFileName,
        sourceHash: preview.sourceHash,
        status: "APPLIED",
        eventCount: preview.counts.events,
        shiftCount: preview.counts.shifts,
        signupCount: preview.counts.signups,
        warningCount: preview.counts.warnings,
        snapshot: JSON.parse(JSON.stringify(preview.events)),
        appliedAt: new Date(),
      },
    });

    await tx.event.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "ARCHIVED", archivedAt: new Date(), isLocked: true },
    });

    const createdEvents = await tx.event.createManyAndReturn({
      data: preview.events.map((event) => ({
          sourceKey: `${event.sourceKey}:${batch.id}`,
          legacyEventId: event.legacyEventId,
          date: new Date(`${event.date}T00:00:00.000Z`),
          name: event.name,
          notes: event.notes || null,
          adminNotes: event.adminNotes || null,
          isPrivate: event.isPrivate,
          isLocked: event.isLocked,
          importBatchId: batch.id,
      })),
      select: { id: true, sourceKey: true },
    });
    const eventIds = new Map(createdEvents.map((event) => [event.sourceKey, event.id]));
    const shiftData = preview.events.flatMap((event) => event.shifts.map((shift) => ({
          sourceKey: `${shift.sourceKey}:${batch.id}`,
          eventId: eventIds.get(`${event.sourceKey}:${batch.id}`)!,
          displayTime: shift.displayTime,
          sortMinutes: shift.sortMinutes,
          capacity: shift.capacity,
          isOpen: shift.isOpen,
    })));
    const createdShifts = await tx.shift.createManyAndReturn({ data: shiftData, select: { id: true, sourceKey: true } });
    const shiftIds = new Map(createdShifts.map((shift) => [shift.sourceKey, shift.id]));
    const assignments = preview.events.flatMap((event) => event.shifts.flatMap((shift) => shift.volunteers.map((volunteer) => ({
            shiftId: shiftIds.get(`${shift.sourceKey}:${batch.id}`)!,
            enteredName: volunteer.name,
            sourceSlot: volunteer.sourceSlot,
            volunteerProfileId: volunteer.volunteerProfileId,
    }))));
    if (assignments.length) await tx.shiftAssignment.createMany({ data: assignments });

    await tx.auditEvent.create({
      data: {
        operationId: batch.operationId,
        actorUserId: actor.id,
        actorNameSnapshot: `${actor.firstName} ${actor.lastName}`,
        actorEmailSnapshot: actor.normalizedEmail,
        action: "SCHEDULE_REPLACED",
        entityType: "ImportBatch",
        entityId: batch.id,
        newData: {
          sourceFileName,
          sourceHash: preview.sourceHash,
          ...preview.counts,
        },
      },
    });

    return batch;
  }, { maxWait: 10_000, timeout: 30_000 });
}
