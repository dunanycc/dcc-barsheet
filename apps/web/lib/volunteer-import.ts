import { createHash } from "node:crypto";
import { displayName, normalizeEmail, type AccessUser } from "./auth-policy";
import prisma from "./prisma";
import { parseCsv } from "./schedule-import";

export type VolunteerImportRow = { firstName: string; lastName: string; email: string; normalizedEmail: string; rowNumber: number };
export type VolunteerImportPreview = { sourceHash: string; rows: VolunteerImportRow[]; rejected: string[]; counts: { rows: number; newRecords: number; updates: number; unchanged: number; warnings: number; errors: number; rejected: number } };

function headerIndex(headers: string[], names: string[]) { return headers.findIndex((header) => names.includes(header.toLowerCase().replace(/[^a-z]/g, ""))); }
export function parseVolunteerImport(text: string) {
  const parsed = parseCsv(text); if (parsed.length < 2) throw new Error("CSV contains no volunteer rows.");
  const headers = parsed[0].map((value) => value.trim().replace(/^\uFEFF/, ""));
  const first = headerIndex(headers, ["firstname", "first"]); const last = headerIndex(headers, ["lastname", "last"]); const email = headerIndex(headers, ["email", "emailaddress"]);
  if (first < 0 || last < 0 || email < 0) throw new Error("CSV requires First Name, Last Name, and Email columns.");
  const rows: VolunteerImportRow[] = []; const rejected: string[] = []; const seen = new Set<string>();
  parsed.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2; const firstName = (cells[first] || "").trim(); const lastName = (cells[last] || "").trim(); const normalizedEmail = normalizeEmail(cells[email] || "");
    if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) { rejected.push(`Row ${rowNumber}: enter a first name, last name, and valid email.`); return; }
    if (seen.has(normalizedEmail)) { rejected.push(`Row ${rowNumber}: duplicate email ${normalizedEmail}.`); return; }
    seen.add(normalizedEmail); rows.push({ firstName, lastName, email: normalizedEmail, normalizedEmail, rowNumber });
  });
  return { sourceHash: createHash("sha256").update(text).digest("hex"), rows, rejected };
}

export async function previewVolunteerImport(text: string): Promise<VolunteerImportPreview> {
  const parsed = parseVolunteerImport(text); const existing = await prisma.user.findMany({ where: { normalizedEmail: { in: parsed.rows.map((row) => row.normalizedEmail) } }, select: { normalizedEmail: true, firstName: true, lastName: true } });
  const byEmail = new Map(existing.map((user) => [user.normalizedEmail, user])); let newRecords = 0; let updates = 0; let unchanged = 0;
  parsed.rows.forEach((row) => { const user = byEmail.get(row.normalizedEmail); if (!user) newRecords += 1; else if (user.firstName !== row.firstName || user.lastName !== row.lastName) updates += 1; else unchanged += 1; });
  return { ...parsed, counts: { rows: parsed.rows.length + parsed.rejected.length, newRecords, updates, unchanged, warnings: 0, errors: parsed.rejected.length, rejected: parsed.rejected.length } };
}

export async function applyVolunteerImport(preview: VolunteerImportPreview, sourceFileName: string, actor: AccessUser) {
  if (preview.rejected.length) throw new Error("Resolve rejected rows before applying the import.");
  const previous = await prisma.importBatch.findFirst({ where: { sourceHash: preview.sourceHash, status: "APPLIED" }, orderBy: { createdAt: "desc" } });
  if (previous) return { batch: previous, repeated: true, created: 0, updated: 0 };
  return prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({ data: { sourceFileName, sourceHash: preview.sourceHash, status: "APPLIED", eventCount: 0, shiftCount: 0, signupCount: preview.rows.length, warningCount: preview.counts.warnings, snapshot: { type: "VOLUNTEERS", rows: preview.rows, counts: preview.counts }, appliedAt: new Date() } });
    let created = 0; let updated = 0;
    for (const row of preview.rows) {
      const existing = await tx.user.findUnique({ where: { normalizedEmail: row.normalizedEmail } });
      if (existing) {
        if (existing.firstName !== row.firstName || existing.lastName !== row.lastName || existing.email !== row.email) { await tx.user.update({ where: { id: existing.id }, data: { firstName: row.firstName, lastName: row.lastName, email: row.email } }); updated += 1; }
      } else {
        await tx.user.create({ data: { email: row.email, normalizedEmail: row.normalizedEmail, firstName: row.firstName, lastName: row.lastName, status: "APPROVED", role: "MEMBER", approvedAt: new Date(), approvedByUserId: actor.id, volunteerProfiles: { create: { firstName: row.firstName, lastName: row.lastName, relationship: "PRIMARY" } } } }); created += 1;
      }
    }
    await tx.auditEvent.create({ data: { operationId: batch.operationId, actorUserId: actor.id, actorNameSnapshot: displayName(actor), actorEmailSnapshot: actor.normalizedEmail, action: "VOLUNTEER_IMPORT_APPLIED", entityType: "ImportBatch", entityId: batch.id, newData: { sourceFileName, sourceHash: preview.sourceHash, created, updated, unchanged: preview.counts.unchanged }, reason: "Volunteer CSV imported without sending authorization email" } });
    return { batch, repeated: false, created, updated };
  });
}
